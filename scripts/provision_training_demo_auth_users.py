#!/usr/bin/env python3
"""
Create Supabase Auth users for the Northline training demo.

Run against the TRAINING Supabase project only (never BTW production).

Prerequisites:
  pip install supabase

Usage:
  export SUPABASE_URL=https://YOUR_TRAINING_REF.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # Settings → API Keys → secret
  export TRAINING_DEMO_PASSWORD='YourRoomPassword1!'   # shared demo password
  python3 scripts/provision_training_demo_auth_users.py

Then run scripts/seed_training_demo.sql in SQL Editor (user_access + roster).
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

DEMO_USERS: tuple[dict[str, str], ...] = (
    {
        "email": "trainer@northline-demo.local",
        "display_name": "Training HR Admin",
        "orbis_role": "admin",
    },
    {
        "email": "supervisor@northline-demo.local",
        "display_name": "Sam Ortiz (Supervisor)",
        "orbis_role": "supervisor",
    },
    {
        "email": "lead@northline-demo.local",
        "display_name": "Dana Chen (Filtered Admin)",
        "orbis_role": "admin",
    },
    {
        "email": "employee@northline-demo.local",
        "display_name": "Casey Brooks (Employee)",
        "orbis_role": "user",
    },
)


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
    parser = argparse.ArgumentParser(description="Create Northline training demo Auth users")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    password = os.environ.get("TRAINING_DEMO_PASSWORD", "").strip()

    if not url or not key:
        print(
            "Set SUPABASE_URL (training project) and SUPABASE_SERVICE_ROLE_KEY.",
            file=sys.stderr,
        )
        return 1

    if not password and not args.dry_run:
        print(
            "Set TRAINING_DEMO_PASSWORD (shared password for all four demo logins).",
            file=sys.stderr,
        )
        return 1

    if "fxljbnyarfwnqgheywgw" in url or "btwglobal" in url.lower():
        print("Refusing to run: URL looks like BTW production.", file=sys.stderr)
        return 1

    client = create_client(url, key)
    auth_emails = list_auth_emails(client)
    created = 0
    skipped = 0

    for spec in DEMO_USERS:
        email = spec["email"]
        if email in auth_emails:
            print(f"skip (exists): {email}")
            skipped += 1
            continue

        payload = {
            "email": email,
            "email_confirm": True,
            "user_metadata": {
                "display_name": spec["display_name"],
                "orbis_training_demo": True,
            },
        }
        if password:
            payload["password"] = password

        if args.dry_run:
            print(f"would create: {email} ({spec['orbis_role']})")
            created += 1
            continue

        try:
            client.auth.admin.create_user(payload)
            print(f"created: {email}")
            auth_emails.add(email)
            created += 1
        except Exception as err:
            print(f"failed {email}: {err}", file=sys.stderr)
            skipped += 1

    print(f"\nDone. created={created} skipped={skipped}")
    if created and password and not args.dry_run:
        print("\nDemo logins (share only in the training room):")
        for spec in DEMO_USERS:
            print(f"  {spec['email']}  /  {password}")
        print("\nNext: run scripts/seed_training_demo.sql in the training SQL Editor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
