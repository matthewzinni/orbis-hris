#!/usr/bin/env python3
"""
Update Orbis employee work_email / personal_email from a Slack member export CSV.

Only updates employees that already exist in Orbis (Supabase employees table).
Matches by normalized name; prefers active Slack members when duplicates exist.

Usage:
  set -a && source scripts/.env.weekly_report && set +a
  python scripts/sync_slack_emails_to_orbis.py /path/to/slack-btwglobal-members.csv --dry-run
  python scripts/sync_slack_emails_to_orbis.py /path/to/slack-btwglobal-members.csv
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("Install: pip install supabase", file=sys.stderr)
    sys.exit(1)

WORK_DOMAIN = "@btwglobal.com"
SKIP_EMAIL_SUFFIXES = ("@slack-bots.com", "@slack-corp.com")
SKIP_STATUSES = {"bot"}


def norm(value: str) -> str:
    text = str(value or "").lower().strip()
    text = text.replace("ü", "u").replace("é", "e").replace("ó", "o").replace("í", "i").replace("ñ", "n")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(value: str) -> list[str]:
    return [t for t in norm(value).split() if t]


NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def meaningful_name_parts(fullname: str) -> list[str]:
    parts = tokens(fullname)
    while parts and parts[-1] in NAME_SUFFIXES:
        parts = parts[:-1]
    return parts


def name_key(first: str, last: str) -> str:
    return f"{norm(first)} {norm(last)}".strip()


def orbis_key_variants(first: str, last: str) -> set[str]:
    f, l = norm(first), norm(last)
    if not f or not l:
        return set()
    return {
        f"{f} {l}",
        f"{l} {f}",
        f"{l}{f}",
        f"{f}{l}",
        compact(f"{f} {l}"),
    }


def slack_key_variants(fullname: str, displayname: str) -> set[str]:
    full = norm(fullname)
    disp = norm(displayname)
    parts = meaningful_name_parts(fullname)
    variants: set[str] = set()
    if full:
        variants.add(full)
    if len(parts) >= 2:
        variants.add(f"{parts[0]} {parts[-1]}")
        variants.add(f"{parts[-1]} {parts[0]}")
        variants.add(f"{parts[-1]}{parts[0]}")
        variants.add(compact(f"{parts[0]} {parts[-1]}"))
    if disp and parts:
        variants.add(f"{disp} {parts[-1]}")
        variants.add(f"{parts[-1]} {disp}")
    return {v for v in variants if v and " " in v}


def load_lookup_keys(repo_root: Path) -> dict[str, set[str]]:
    path = repo_root / "tools" / "employee_lookup.csv"
    out: dict[str, set[str]] = {}
    if not path.is_file():
        return out
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            emp_id = str(row.get("employee_id") or "").strip()
            keys = {norm(k) for k in str(row.get("generated_keys") or "").split("|") if k.strip()}
            first = str(row.get("first_name") or "").strip()
            last = str(row.get("last_name") or "").strip()
            keys |= orbis_key_variants(first, last)
            keys = {k for k in keys if k and (" " in k or len(k) >= 8)}
            if emp_id:
                out[emp_id] = keys
    return out


def compact(value: str) -> str:
    return norm(value).replace(" ", "")


def first_names_close(a: str, b: str) -> bool:
    x, y = norm(a), norm(b)
    if not x or not y:
        return False
    if x == y or x.startswith(y[:4]) or y.startswith(x[:4]) or y.startswith(x) or x.startswith(y):
        return True
    if len(x) >= 5 and len(y) >= 5 and abs(len(x) - len(y)) <= 2:
        mismatches = sum(1 for i in range(min(len(x), len(y))) if x[i] != y[i])
        mismatches += abs(len(x) - len(y))
        return mismatches <= 2
    return False


def slack_last_name_matches(orbis_last: str, fullname: str) -> bool:
    parts = meaningful_name_parts(fullname)
    target = compact(orbis_last)
    if not parts or not target:
        return False
    candidates = [parts[-1]]
    if len(parts) >= 2:
        candidates.append("".join(parts[-2:]))
    return any(compact(c) == target for c in candidates)


def row_matches_person(first: str, last: str, row: dict[str, str]) -> bool:
    f, l = norm(first), norm(last)
    if not f or not l:
        return False
    full = norm(row["fullname"])
    disp = norm(row["displayname"])
    anchor = f"{f} {l}"
    if full.startswith(anchor) or anchor in full:
        return True
    if disp == f and slack_last_name_matches(l, row["fullname"]):
        return True
    parts = meaningful_name_parts(row["fullname"])
    if parts and slack_last_name_matches(l, row["fullname"]) and first_names_close(f, parts[0]):
        return True
    return False


def is_work_email(email: str) -> bool:
    return email.lower().endswith(WORK_DOMAIN)


def should_skip_email(email: str) -> bool:
    lower = email.lower().strip()
    if not lower or "@" not in lower:
        return True
    return any(lower.endswith(suffix) for suffix in SKIP_EMAIL_SUFFIXES)


def slack_row_score(status: str, billing_active: str) -> int:
    score = 0
    if status.lower() == "member":
        score += 10
    if status.lower() in {"admin", "primary owner"}:
        score += 8
    if billing_active.strip() == "1":
        score += 5
    if status.lower() == "deactivated":
        score -= 5
    return score


def load_slack_rows(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            status = str(row.get("status") or "").strip()
            if status.lower() in SKIP_STATUSES:
                continue
            email = str(row.get("email") or "").strip()
            if should_skip_email(email):
                continue
            rows.append(
                {
                    "email": email.lower(),
                    "status": status,
                    "billing_active": str(row.get("billing-active") or "").strip(),
                    "fullname": str(row.get("fullname") or "").strip(),
                    "displayname": str(row.get("displayname") or "").strip(),
                    "score": slack_row_score(status, str(row.get("billing-active") or "")),
                    "keys": slack_key_variants(
                        str(row.get("fullname") or ""),
                        str(row.get("displayname") or ""),
                    ),
                }
            )
    return rows


def match_slack_to_employee(
    first: str,
    last: str,
    emp_id: str,
    lookup_keys: dict[str, set[str]],
    slack_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    targets = orbis_key_variants(first, last) | lookup_keys.get(emp_id, set())
    if not targets:
        return []

    matched: list[dict[str, str]] = []
    f, l = norm(first), norm(last)
    for row in slack_rows:
        if targets & row["keys"]:
            matched.append(row)
            continue
        disp = norm(row["displayname"])
        full_parts = tokens(row["fullname"])
        if disp and f and l and disp == f and full_parts and full_parts[-1] == l:
            matched.append(row)
            continue
        if row_matches_person(first, last, row):
            matched.append(row)
    return matched


def pick_emails(rows: list[dict[str, str]]) -> tuple[str | None, str | None]:
    if not rows:
        return None, None
    sorted_rows = sorted(rows, key=lambda r: r["score"], reverse=True)
    work: str | None = None
    personal: str | None = None
    for row in sorted_rows:
        email = row["email"]
        if is_work_email(email):
            if not work:
                work = email
        elif not personal:
            personal = email
    return work, personal


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Slack export emails into Orbis employees")
    parser.add_argument(
        "slack_csv",
        nargs="?",
        default=str(Path.home() / "Desktop" / "slack-btwglobal-members.csv"),
        help="Path to Slack member export CSV",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print updates without writing")
    args = parser.parse_args()

    slack_path = Path(args.slack_csv).expanduser()
    if not slack_path.is_file():
        print(f"Slack CSV not found: {slack_path}", file=sys.stderr)
        return 1

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        return 1

    repo_root = Path(__file__).resolve().parents[1]
    lookup_keys = load_lookup_keys(repo_root)
    slack_rows = load_slack_rows(slack_path)

    client = create_client(url, key)
    res = (
        client.table("employees")
        .select("id, first_name, last_name, work_email, personal_email, status")
        .execute()
    )
    employees = res.data or []

    updated = 0
    skipped = 0
    unmatched: list[str] = []

    for emp in employees:
        emp_id = str(emp.get("id") or "").strip()
        first = str(emp.get("first_name") or "").strip()
        last = str(emp.get("last_name") or "").strip()
        name = f"{first} {last}".strip() or emp_id

        matches = match_slack_to_employee(first, last, emp_id, lookup_keys, slack_rows)
        work, personal = pick_emails(matches)

        if not work and not personal:
            unmatched.append(name)
            skipped += 1
            continue

        payload: dict[str, str | None] = {}
        if work:
            payload["work_email"] = work
        if personal:
            payload["personal_email"] = personal

        current_work = str(emp.get("work_email") or "").strip().lower()
        current_personal = str(emp.get("personal_email") or "").strip().lower()
        changes = []
        if work and work != current_work:
            changes.append(f"work_email: {current_work or '(empty)'} -> {work}")
        if personal and personal != current_personal:
            changes.append(f"personal_email: {current_personal or '(empty)'} -> {personal}")

        if not changes:
            skipped += 1
            continue

        print(f"{emp_id} {name}")
        for line in changes:
            print(f"  {line}")

        if not args.dry_run:
            client.table("employees").update(payload).eq("id", emp_id).execute()
        updated += 1

    print(f"\nDone. updated={updated} skipped={skipped} unmatched={len(unmatched)}")
    if unmatched:
        print("\nNo Slack match (Orbis employees unchanged):")
        for name in sorted(unmatched):
            print(f"  - {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
