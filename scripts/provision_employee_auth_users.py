#!/usr/bin/env python3
"""
Create Supabase Auth users for employee portal logins (role=employee in user_access).

Magic links require an Auth user when "Allow new users to sign up" is OFF in Supabase.
Run after provision_employee_portal_access.py.

Usage:
  set -a && source scripts/.env.weekly_report && set +a
  python3 scripts/provision_employee_auth_users.py [--dry-run]
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


def list_auth_emails(client) -> set[str]:
    emails: set[str] = set()
    page = 1
    per_page = 200
    while True:
        result = client.auth.admin.list_users(page=page, per_page=per_page)
        users = getattr(result, "users", None) or result
        if not users:
            break
        for user in users:
            email = str(getattr(user, "email", None) or "").strip().lower()
            if email:
                emails.add(email)
        if len(users) < per_page:
            break
        page += 1
    return emails


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create Supabase Auth users for employee portal emails"
    )
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role).", file=sys.stderr)
        return 1

    client = create_client(url, key)

    access_rows = (
        client.table("user_access")
        .select("email, role, linked_employee_id, display_name")
        .eq("role", "employee")
        .execute()
    ).data or []

    auth_emails = list_auth_emails(client)
    created = 0
    skipped = 0

    for row in access_rows:
        email = str(row.get("email") or "").strip().lower()
        emp_id = str(row.get("linked_employee_id") or "").strip()
        if not email or "@" not in email:
            skipped += 1
            continue

        if email in auth_emails:
            skipped += 1
            continue

        if args.dry_run:
            print(f"would create auth user: {email} -> {emp_id or '?'}")
            created += 1
            continue

        try:
            client.auth.admin.create_user(
                {
                    "email": email,
                    "email_confirm": True,
                    "user_metadata": {"orbis_employee_id": emp_id} if emp_id else {},
                }
            )
            print(f"created auth user: {email} -> {emp_id or '?'}")
            auth_emails.add(email)
            created += 1
        except Exception as err:
            print(f"failed {email}: {err}", file=sys.stderr)
            skipped += 1

    print(f"Done. created={created} skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
