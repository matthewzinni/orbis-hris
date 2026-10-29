#!/usr/bin/env python3
"""
Sync remaining PTO hours from QuickBooks Time (TSheets / Intuit Workforce) into Orbis.

For every active QuickBooks Time user, reads `pto_balances` (PTO jobcode id -> seconds remaining),
matches the user to an Orbis employee, and writes:

  employees.pto_balance_hours      total hours remaining (all counted PTO types)
  employees.pto_balance_as_of      today (America/New_York)
  employees.pto_balance_source     'quickbooks_time'
  employees.pto_balance_breakdown  {"<PTO type name>": hours, ...}

Matching (never creates or deletes employees):
  1. QBT email = employees.work_email or employees.personal_email (case-insensitive)
  2. exact first + last name (accents/punctuation ignored)
  3. first name + any shared last-name word (e.g. "Borjas" vs "Borjas-Barrera"), only if unique
Anyone who does not match, or matches more than one employee, is logged and skipped.

Env (GitHub Actions secrets or scripts/.env.weekly_report):
  QBT_ACCESS_TOKEN            QuickBooks Time API token
  SUPABASE_URL                https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   service role key (bypasses RLS; required to write)
  QBT_PTO_TYPES               optional comma list of QBT PTO type names to count (default: all)

Usage:
  python3 scripts/sync_qbt_pto_balances.py --dry-run    # show matches + balances, write nothing
  python3 scripts/sync_qbt_pto_balances.py              # write balances
  python3 scripts/sync_qbt_pto_balances.py --scheduled  # cron mode (only runs at 6 AM ET)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from weekly_orbis_report_email import (  # noqa: E402
    bootstrap_config,
    die,
    eprint,
    env_required,
    resolve_supabase_url,
    rest_get,
)
from weekly_time_off_email import qbt_get  # noqa: E402

ET = ZoneInfo("America/New_York")
SYNC_HOUR_ET = int(os.environ.get("PTO_SYNC_HOUR_ET", "6"))
SOURCE = "quickbooks_time"


# ---------------------------------------------------------------------------
# QuickBooks Time
# ---------------------------------------------------------------------------


def fetch_all(path: str, key: str, params: dict[str, str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    page = 1
    while True:
        body = qbt_get(path, {**params, "limit": "200", "page": str(page)})
        out.update((body.get("results") or {}).get(key) or {})
        if not body.get("more") or page >= 50:
            break
        page += 1
    return out


def pto_type_filter() -> set[str]:
    raw = os.environ.get("QBT_PTO_TYPES", "")
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


def user_balances(user: dict[str, Any], jobcodes: dict[str, dict], allowed: set[str]) -> dict[str, float]:
    """Hours remaining per PTO type name for one QBT user."""
    raw = user.get("pto_balances") or {}
    if isinstance(raw, list):  # defensive: older/odd shapes
        raw = {str(i.get("jobcode_id")): i.get("balance") for i in raw if isinstance(i, dict)}
    out: dict[str, float] = {}
    for jobcode_id, seconds in raw.items():
        name = str((jobcodes.get(str(jobcode_id)) or {}).get("name") or f"PTO type {jobcode_id}")
        if allowed and name.lower() not in allowed:
            continue
        try:
            hours = float(seconds or 0) / 3600.0
        except (TypeError, ValueError):
            continue
        out[name] = round(out.get(name, 0.0) + hours, 2)
    return out


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


def norm_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", text.lower())).strip()


def norm_email(value: Any) -> str:
    return str(value or "").strip().lower()


def is_terminated(emp: dict[str, Any]) -> bool:
    return str(emp.get("status") or "").strip().upper() == "TERMINATED" and bool(emp.get("termination_date"))


def build_matcher(employees: list[dict[str, Any]]):
    current = [e for e in employees if not is_terminated(e)]
    by_email: dict[str, list[dict]] = {}
    by_name: dict[str, list[dict]] = {}
    for e in current:
        for field in ("work_email", "personal_email"):
            em = norm_email(e.get(field))
            if em:
                by_email.setdefault(em, []).append(e)
        full = f"{norm_text(e.get('first_name'))} {norm_text(e.get('last_name'))}".strip()
        if full:
            by_name.setdefault(full, []).append(e)
    terminated_names = {
        f"{norm_text(e.get('first_name'))} {norm_text(e.get('last_name'))}".strip()
        for e in employees if is_terminated(e)
    }

    def unique(rows: list[dict]) -> list[dict]:
        seen: dict[str, dict] = {}
        for r in rows:
            seen[str(r.get("id"))] = r
        return list(seen.values())

    def match(user: dict[str, Any]) -> tuple[dict | None, str]:
        em = norm_email(user.get("email"))
        if em and em in by_email:
            hits = unique(by_email[em])
            if len(hits) == 1:
                return hits[0], "email"
            return None, f"email matches {len(hits)} employees"

        first = norm_text(user.get("first_name"))
        last = norm_text(user.get("last_name"))
        full = f"{first} {last}".strip()
        if full in by_name:
            hits = unique(by_name[full])
            if len(hits) == 1:
                return hits[0], "name"
            return None, f"name matches {len(hits)} employees"

        last_words = set(last.split())
        if first and last_words:
            hits = [
                e for e in current
                if norm_text(e.get("first_name")) == first
                and last_words & set(norm_text(e.get("last_name")).split())
            ]
            hits = unique(hits)
            if len(hits) == 1:
                return hits[0], "first + last-name word"
            if len(hits) > 1:
                return None, f"partial name matches {len(hits)} employees"

        if full in terminated_names:
            return None, "terminated in Orbis (still active in QuickBooks Time)"
        return None, "no matching employee"

    return match


# ---------------------------------------------------------------------------
# Supabase write
# ---------------------------------------------------------------------------


def patch_employee(base_url: str, service_key: str, employee_id: str, body: dict[str, Any]) -> None:
    url = f"{base_url.rstrip('/')}/rest/v1/employees?id=eq.{urllib.parse.quote(employee_id)}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"Supabase HTTP {err.code} updating employee {employee_id}: {detail}") from err


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def scheduled_run_should_go() -> bool:
    now = datetime.now(timezone.utc).astimezone(ET)
    if now.hour != SYNC_HOUR_ET:
        print(f"Scheduled slot is {now:%H:%M} ET, not {SYNC_HOUR_ET}:00 ET — skipping (other slot runs).")
        return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Show matches and balances; write nothing.")
    parser.add_argument("--scheduled", action="store_true", help="Cron mode: only run at PTO_SYNC_HOUR_ET.")
    args = parser.parse_args()

    bootstrap_config()
    if args.scheduled and not scheduled_run_should_go():
        return

    env_required("QBT_ACCESS_TOKEN")
    base_url = resolve_supabase_url()
    service_key = env_required("SUPABASE_SERVICE_ROLE_KEY")
    today = datetime.now(timezone.utc).astimezone(ET).date().isoformat()

    jobcodes = fetch_all("jobcodes", "jobcodes", {"type": "pto"})
    users = fetch_all("users", "users", {"active": "true"})
    allowed = pto_type_filter()

    print(f"QuickBooks Time: {len(users)} active users, PTO types: "
          + (", ".join(sorted(str(j.get('name')) for j in jobcodes.values())) or "(none)"))
    if allowed:
        print(f"Counting only: {', '.join(sorted(allowed))}")
    if users:
        sample = next(iter(users.values()))
        print(f"Response check: user has pto_balances = {type(sample.get('pto_balances')).__name__}")

    employees = rest_get(
        base_url, service_key, "employees",
        {"select": "id,first_name,last_name,work_email,personal_email,status,termination_date,"
                   "pto_balance_hours,pto_balance_as_of"},
    )
    match = build_matcher(employees)

    matched: list[tuple[dict, dict, str, float, dict[str, float]]] = []
    unmatched: list[tuple[dict, str]] = []
    claimed: dict[str, str] = {}
    for user in sorted(users.values(), key=lambda u: (norm_text(u.get("last_name")), norm_text(u.get("first_name")))):
        emp, how = match(user)
        if not emp:
            unmatched.append((user, how))
            continue
        emp_id = str(emp.get("id"))
        qbt_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        if emp_id in claimed:
            unmatched.append((user, f"employee already matched to {claimed[emp_id]}"))
            continue
        claimed[emp_id] = qbt_name
        breakdown = user_balances(user, jobcodes, allowed)
        total = round(sum(breakdown.values()), 2)
        matched.append((user, emp, how, total, breakdown))

    print(f"\nMATCHED ({len(matched)})")
    for user, emp, how, total, breakdown in matched:
        orbis_name = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
        prev = emp.get("pto_balance_hours")
        parts = ", ".join(f"{k} {v:g}" for k, v in sorted(breakdown.items())) or "no PTO balances"
        print(f"  {orbis_name:<28} {total:>7.2f} hr  (was {prev if prev is not None else '—'})  "
              f"[{parts}]  via {how}")

    print(f"\nNOT MATCHED ({len(unmatched)}) — skipped")
    for user, why in unmatched:
        name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        print(f"  {name:<28} {norm_email(user.get('email')) or '(no email)':<36} {why}")

    matched_ids = set(claimed)
    current_unsynced = [
        e for e in employees
        if not is_terminated(e) and str(e.get("status") or "").upper() == "ACTIVE" and str(e.get("id")) not in matched_ids
    ]
    print(f"\nActive Orbis employees with no QuickBooks Time match ({len(current_unsynced)}):")
    for e in current_unsynced:
        print(f"  {e.get('first_name', '')} {e.get('last_name', '')}".rstrip())

    if args.dry_run:
        print("\nDry run — nothing written.")
        return

    for user, emp, _how, total, breakdown in matched:
        patch_employee(base_url, service_key, str(emp.get("id")), {
            "pto_balance_hours": total,
            "pto_balance_as_of": today,
            "pto_balance_source": SOURCE,
            "pto_balance_breakdown": breakdown,
        })
    print(f"\nUpdated {len(matched)} employees (as of {today}).")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as err:
        eprint(str(err))
        die(str(err))
