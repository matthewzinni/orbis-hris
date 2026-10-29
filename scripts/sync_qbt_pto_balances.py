#!/usr/bin/env python3
"""
Sync remaining PTO hours from QuickBooks Time (TSheets / Intuit Workforce) into Orbis.

For every active QuickBooks Time user, reads `pto_balances` (PTO jobcode id -> seconds remaining),
matches the user to an Orbis employee, and writes:

  employees.pto_balance_hours      total hours remaining (all counted PTO types)
  employees.pto_balance_as_of      today (America/New_York)
  employees.pto_balance_source     'quickbooks_time'
  employees.pto_balance_breakdown  {"<PTO type name>": hours, ...}

Matching (never creates or deletes employees), in passes so the strongest matches go first:
  1. exact name (accents, punctuation, Jr/III ignored)
  2. QBT email = work or personal email, only when the names are compatible
  3. Orbis first name (nickname / prefix ok: Nick=Nicholas, Sam=Samuel) + a last-name word,
     e.g. "Alex Trent Wynne" -> Trent Wynne, "Karla Barrera Gomez" -> Karla Barrera
Anyone who does not match, or matches more than one employee, is logged and skipped.

Env (GitHub Actions secrets or scripts/.env.weekly_report):
  QBT_ACCESS_TOKEN            QuickBooks Time API token
  SUPABASE_URL                https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   service role key (bypasses RLS; required to write)
  QBT_PTO_TYPES               optional comma list of QBT PTO type names to count
                              (default "Paid Time Off (PTO)"; "all" = every type)

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


DEFAULT_PTO_TYPES = "Paid Time Off (PTO)"


def pto_type_filter() -> set[str]:
    """PTO type names to count. Default: only "Paid Time Off (PTO)" (not Holiday, Sick, etc.).
    QBT_PTO_TYPES=all counts every type."""
    raw = os.environ.get("QBT_PTO_TYPES", "").strip() or DEFAULT_PTO_TYPES
    if raw.lower() == "all":
        return set()
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


NAME_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# Common nicknames -> formal first name (both directions are checked).
NICKNAMES = {
    "nick": "nicholas", "sam": "samuel", "matt": "matthew", "mike": "michael", "will": "william",
    "bill": "william", "rob": "robert", "bob": "robert", "jim": "james", "tom": "thomas",
    "tony": "anthony", "alex": "alexander", "chris": "christopher", "dan": "daniel", "dave": "david",
    "joe": "joseph", "kate": "katherine", "katie": "katherine", "liz": "elizabeth", "beth": "elizabeth",
    "andy": "andrew", "drew": "andrew", "ben": "benjamin", "steve": "steven", "josh": "joshua",
    "jake": "jacob", "abby": "abigail", "jen": "jennifer", "jenny": "jennifer", "zach": "zachary",
}


def name_tokens(value: Any) -> list[str]:
    return [t for t in norm_text(value).split() if t not in NAME_SUFFIXES]


def first_compatible(a: str, b: str) -> bool:
    if a == b:
        return True
    if NICKNAMES.get(a) == b or NICKNAMES.get(b) == a:
        return True
    return min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a))


def match_users(users: list[dict[str, Any]], employees: list[dict[str, Any]]):
    """Match QBT users to Orbis employees in passes so the strongest matches claim employees first.

    1. exact name (accents, punctuation, Jr/III ignored)
    2. email (work or personal) — only if the names are compatible, so a shared or wrong email
       in QuickBooks Time cannot attach one person's balance to someone else
    3. Orbis first name (or nickname / prefix) + an Orbis last-name word both appear in the QBT name
    Returns (matches {user_index: (employee, how)}, unmatched {user_index: reason}).
    """
    current = [e for e in employees if not is_terminated(e)]
    emp_first = {str(e.get("id")): name_tokens(e.get("first_name")) for e in employees}
    emp_last = {str(e.get("id")): name_tokens(e.get("last_name")) for e in employees}
    emp_full = {k: " ".join(emp_first[k] + emp_last[k]) for k in emp_first}
    user_tokens = [name_tokens(f"{u.get('first_name', '')} {u.get('last_name', '')}") for u in users]

    def compatible(i: int, e: dict) -> bool:
        k = str(e.get("id"))
        toks = set(user_tokens[i])
        if toks & set(emp_last[k]):
            return True
        return any(first_compatible(f, t) for f in emp_first[k] for t in toks)

    def token_match(i: int, e: dict) -> bool:
        k = str(e.get("id"))
        toks = user_tokens[i]
        return bool(set(toks) & set(emp_last[k])) and any(
            first_compatible(f, t) for f in emp_first[k][:1] for t in toks
        )

    matches: dict[int, tuple[dict, str]] = {}
    reasons: dict[int, str] = {}
    claimed: set[str] = set()

    def run_pass(label: str, candidates_for) -> None:
        for i in range(len(users)):
            if i in matches:
                continue
            hits = [e for e in candidates_for(i) if str(e.get("id")) not in claimed]
            hits = list({str(e.get("id")): e for e in hits}.values())
            if len(hits) == 1:
                matches[i] = (hits[0], label)
                claimed.add(str(hits[0].get("id")))
            elif len(hits) > 1 and i not in reasons:
                reasons[i] = f"{label} matches {len(hits)} employees"

    run_pass("name", lambda i: [
        e for e in current if user_tokens[i] and emp_full[str(e.get("id"))] == " ".join(user_tokens[i])
    ])

    def by_email(i: int) -> list[dict]:
        em = norm_email(users[i].get("email"))
        if not em:
            return []
        hits = [e for e in current if em in (norm_email(e.get("work_email")), norm_email(e.get("personal_email")))]
        ok = [e for e in hits if compatible(i, e)]
        if hits and not ok and i not in reasons:
            reasons[i] = "email belongs to a different-named employee — check QuickBooks Time"
        return ok

    run_pass("email", by_email)
    run_pass("partial name", lambda i: [e for e in current if token_match(i, e)])

    terminated_full = {emp_full[str(e.get("id"))] for e in employees if is_terminated(e)}
    unmatched: dict[int, str] = {}
    for i in range(len(users)):
        if i in matches:
            continue
        if " ".join(user_tokens[i]) in terminated_full:
            unmatched[i] = "terminated in Orbis (still active in QuickBooks Time)"
        else:
            unmatched[i] = reasons.get(i, "no matching employee")
    return matches, unmatched


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
    ordered = sorted(users.values(), key=lambda u: (norm_text(u.get("last_name")), norm_text(u.get("first_name"))))
    matches, unmatched_map = match_users(ordered, employees)

    matched: list[tuple[dict, dict, str, float, dict[str, float]]] = []
    unmatched: list[tuple[dict, str]] = [(ordered[i], why) for i, why in sorted(unmatched_map.items())]
    claimed: dict[str, str] = {}
    for i, (emp, how) in sorted(matches.items()):
        user = ordered[i]
        claimed[str(emp.get("id"))] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
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
