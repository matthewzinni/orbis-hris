#!/usr/bin/env python3
"""
Import PTO balance baselines from CSV into employees.pto_balance_hours.

Use after exporting QuickBooks Time PTO balance report (Paid Time Off column).

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 scripts/import_pto_balances.py scripts/examples/pto_balances_2026-06-03.csv --dry-run
  python3 scripts/import_pto_balances.py scripts/examples/pto_balances_2026-06-03.csv --as-of 2026-06-03
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from typing import Any


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    eprint(message)
    sys.exit(code)


def normalize_header(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def parse_hours(raw: str) -> float:
    s = (raw or "").strip()
    if not s:
        return 0.0
    return float(s)


def parse_as_of(raw: str) -> str:
    s = (raw or "").strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Could not parse as-of date {s!r}")


def rest_json(
    method: str,
    base_url: str,
    service_key: str,
    path: str,
    query: dict[str, str] | None = None,
    body: Any | None = None,
) -> tuple[int, Any]:
    q = urllib.parse.urlencode(query) if query else ""
    url = f"{base_url.rstrip('/')}/rest/v1/{path}"
    if q:
        url = f"{url}?{q}"

    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
        "Prefer": "return=minimal",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode("utf-8")
            if not text.strip():
                return resp.getcode() or 200, None
            return resp.getcode() or 200, json.loads(text)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} {err.reason}: {detail}") from err


def fetch_employees(base_url: str, service_key: str) -> list[dict[str, Any]]:
    # id is the BTW roster key; employee_id/email are not on all Orbis projects
    url = f"{base_url.rstrip('/')}/rest/v1/employees?select=id,first_name,last_name"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
        "Range": "0-49999",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    if not isinstance(rows, list):
        raise RuntimeError("Unexpected employees response")
    return rows


def norm_name(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def build_indexes(rows: list[dict[str, Any]]) -> tuple[dict[str, str], dict[tuple[str, str], list[str]]]:
    lookup: dict[str, str] = {}
    name_index: dict[tuple[str, str], list[str]] = defaultdict(list)

    for row in rows:
        emp_id = str(row.get("id") or "").strip()
        if not emp_id:
            continue

        alt = str(row.get("employee_id") or "").strip()
        if alt:
            lookup.setdefault(alt, emp_id)
            lookup.setdefault(alt.lower(), emp_id)
        lookup.setdefault(emp_id, emp_id)

        email = str(row.get("email") or "").strip().lower()
        if email:
            lookup.setdefault(email, emp_id)

        fn = str(row.get("first_name") or "").strip().lower()
        ln = str(row.get("last_name") or "").strip().lower()
        if fn and ln:
            name_index[(fn, ln)].append(emp_id)
            lookup.setdefault(norm_name(f"{fn}{ln}"), emp_id)
            lookup.setdefault(norm_name(f"{ln}{fn}"), emp_id)

    return lookup, name_index


def resolve_employee_id(
    row: dict[str, str],
    lookup: dict[str, str],
    name_index: dict[tuple[str, str], list[str]],
) -> str:
    for key in ("employee_id", "id", "btw"):
        val = row.get(key, "").strip()
        if val:
            hit = lookup.get(val) or lookup.get(val.lower())
            if hit:
                return hit
            raise ValueError(f"No employee for {key}={val!r}")

    email = row.get("email", "").strip().lower()
    if email:
        hit = lookup.get(email)
        if hit:
            return hit
        raise ValueError(f"No employee for email={email!r}")

    fn = row.get("first_name", "").strip().lower()
    ln = row.get("last_name", "").strip().lower()
    if fn and ln:
        candidates = name_index.get((fn, ln), [])
        if len(candidates) == 1:
            return candidates[0]
        fuzzy = lookup.get(norm_name(f"{fn}{ln}"))
        if fuzzy:
            return fuzzy
        if len(candidates) > 1:
            raise ValueError(f"Ambiguous name {fn} {ln}")
        raise ValueError(f"No employee for name {fn} {ln}")

    raise ValueError("Need employee_id or first_name+last_name")


def load_csv(path: str) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header")
        rows: list[dict[str, str]] = []
        for raw in reader:
            norm = {
                normalize_header(k): (v or "").strip()
                for k, v in raw.items()
                if k is not None
            }
            if not any(norm.values()):
                continue
            rows.append(norm)
        return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--as-of",
        default="2026-06-03",
        help="Stored on employees.pto_balance_as_of (default 2026-06-03)",
    )
    args = parser.parse_args()

    as_of = parse_as_of(args.as_of)

    base_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base_url or not service_key:
        die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    try:
        csv_rows = load_csv(args.csv_path)
        employees = fetch_employees(base_url, service_key)
    except Exception as err:
        die(str(err))

    lookup, name_index = build_indexes(employees)
    updates: list[tuple[str, float, str]] = []
    errors: list[str] = []

    for i, row in enumerate(csv_rows, start=2):
        try:
            emp_id = resolve_employee_id(row, lookup, name_index)
            hours_raw = row.get("pto_balance_hours") or row.get("paid_time_off_(pto)") or row.get("pto") or row.get("hours") or "0"
            hours = parse_hours(hours_raw)
            name = f"{row.get('first_name', '')} {row.get('last_name', '')}".strip() or emp_id
            updates.append((emp_id, hours, name))
        except ValueError as err:
            errors.append(f"Row {i}: {err}")

    if errors:
        for msg in errors:
            eprint(msg)
        die(f"{len(errors)} row error(s)")

    eprint(f"Prepared {len(updates)} employee PTO balance update(s) as of {as_of}.")

    if args.dry_run:
        for emp_id, hours, name in updates[:5]:
            eprint(f"  {name} ({emp_id}) → {hours:.2f} hr")
        if len(updates) > 5:
            eprint(f"  … and {len(updates) - 5} more")
        eprint("--dry-run: no updates applied.")
        return

    for emp_id, hours, name in updates:
        try:
            rest_json(
                "PATCH",
                base_url,
                service_key,
                "employees",
                query={"id": f"eq.{emp_id}"},
                body={"pto_balance_hours": hours, "pto_balance_as_of": as_of},
            )
            eprint(f"Updated {name} ({emp_id}) → {hours:.2f} hr")
        except Exception as err:
            die(f"Update failed for {emp_id}: {err}")

    eprint("Done.")


if __name__ == "__main__":
    main()
