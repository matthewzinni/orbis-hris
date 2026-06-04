#!/usr/bin/env python3
"""
Create user_access rows (role=employee) from employee work/personal emails.

Does NOT create Supabase Auth users — employees sign in via magic link on first visit,
or HR invites them in Supabase Auth. Orbis auto-links on login when email matches roster.

Usage:
  set -a && source scripts/.env.weekly_report && set +a
  python scripts/provision_employee_portal_access.py [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import sys

try:
    from supabase import create_client
except ImportError:
    print("Install: pip install supabase", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision employee portal user_access rows")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role).", file=sys.stderr)
        return 1

    client = create_client(url, key)

    res = (
        client.table("employees")
        .select("id, first_name, last_name, work_email, personal_email, email, status")
        .execute()
    )
    rows = res.data or []

    created = 0
    skipped = 0

    for emp in rows:
        status = str(emp.get("status") or "").strip().upper()
        if status in ("TERMINATED", "INACTIVE"):
            skipped += 1
            continue

        emp_id = str(emp.get("id") or "").strip()
        email = (
            str(emp.get("personal_email") or "").strip()
            or str(emp.get("work_email") or "").strip()
            or str(emp.get("email") or "").strip()
        ).lower()
        if not emp_id or not email or "@" not in email:
            skipped += 1
            continue

        name = f"{emp.get('first_name') or ''} {emp.get('last_name') or ''}".strip()

        existing = (
            client.table("user_access")
            .select("email, role")
            .ilike("email", email)
            .limit(1)
            .execute()
        )
        if existing.data:
            skipped += 1
            continue

        payload = {
            "email": email,
            "display_name": name or None,
            "role": "employee",
            "linked_employee_id": emp_id,
        }

        if args.dry_run:
            print(f"would create employee access: {email} -> {emp_id}")
            created += 1
            continue

        client.table("user_access").insert(payload).execute()
        print(f"created: {email} -> {emp_id}")
        created += 1

    print(f"Done. created={created} skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
