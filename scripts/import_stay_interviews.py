#!/usr/bin/env python3
"""
Import stay interviews from a CSV file into Supabase public.stay_interviews,
linking each row to an employee via employees.id (same value Orbis uses as dbId).

Environment (required):
  SUPABASE_URL          — Project URL, e.g. https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS; do not commit or ship to clients)

Usage:
  python3 scripts/import_stay_interviews.py path/to/stay_interviews.csv
  python3 scripts/import_stay_interviews.py path/to/stay_interviews.csv --dry-run

CSV columns (headers are case-insensitive; spaces → underscores internally):
  Required:
    • One employee locator (first match wins):
        employee_id  — matches employees.id OR employees.employee_id (exact string).
          In Orbis, new hires get BTW-prefixed IDs from the app (see src/services/employeeIds.ts):
          calendar 2026 → prefix BTW26 then sequence (e.g. BTW261, BTW262); from 2027 → BTW2701 style.
        id           — same as employee_id if you prefer this name
        email        — matches employees.email (case-insensitive)
        first_name + last_name — together, case-insensitive (error if ambiguous)
    • interview_date — YYYY-MM-DD, MM/DD/YYYY, or YYYY/MM/DD

  Optional (Postgres columns / app form):
    interview_type — use the same values as the drawer dropdown: 30-Day, 90-Day, 6-Month,
          Annual, Retention Risk, Other (blank defaults to "Stay Interview" in the importer)
    q1–q7 — same prompts as the Stay Interview tab in index.html (BTW Global Orbis)
    manager_summary — HR / Manager Summary field

See scripts/examples/stay_interviews_template.csv (header row only) and scripts/README.md for a full example row.
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


OPTIONAL_STAY_FIELDS = (
    "interview_type",
    "q1",
    "q2",
    "q3",
    "q4",
    "q5",
    "q6",
    "q7",
    "manager_summary",
)


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    eprint(message)
    sys.exit(code)


def normalize_header(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def parse_interview_date(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise ValueError("interview_date is empty")
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Could not parse interview_date {s!r} (try YYYY-MM-DD or MM/DD/YYYY)")


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
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=minimal"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status = resp.getcode() or 200
            text = resp.read().decode("utf-8")
            if not text.strip():
                return status, None
            return status, json.loads(text)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} {err.reason}: {detail}") from err


def fetch_employees(base_url: str, service_key: str) -> list[dict[str, Any]]:
    """Fetch up to 50k employees (adjust Range if needed)."""
    # employee_id / email omitted: not present on all Orbis projects (id is the BTW key)
    url = f"{base_url.rstrip('/')}/rest/v1/employees?select=id,first_name,last_name"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
        "Range": "0-49999",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        text = resp.read().decode("utf-8")
    rows = json.loads(text)
    if not isinstance(rows, list):
        raise RuntimeError("Unexpected employees response shape")
    return rows


def build_employee_indexes(
    rows: list[dict[str, Any]],
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """
    Returns:
      lookup: key -> employees.id (canonical for stay_interviews.employee_id)
      name_index: (first, last) lower -> list of ids (for ambiguity check)
    """
    lookup: dict[str, str] = {}
    name_index: dict[tuple[str, str], list[str]] = defaultdict(list)

    for row in rows:
        emp_id = str(row.get("id") or "").strip()
        if not emp_id:
            continue

        alt = str(row.get("employee_id") or "").strip()
        if alt:
            lookup.setdefault(alt, emp_id)
            if alt.lower() != alt:
                lookup.setdefault(alt.lower(), emp_id)

        lookup.setdefault(emp_id, emp_id)

        email = str(row.get("email") or "").strip()
        if email:
            lookup.setdefault(email.lower(), emp_id)

        fn = str(row.get("first_name") or "").strip().lower()
        ln = str(row.get("last_name") or "").strip().lower()
        if fn and ln:
            name_index[(fn, ln)].append(emp_id)

    return lookup, name_index


def resolve_employee_id(
    row: dict[str, str],
    lookup: dict[str, str],
    name_index: dict[tuple[str, str], list[str]],
) -> str:
    for key in ("employee_id", "id", "emp_id", "btw", "employee_btw"):
        val = row.get(key, "").strip()
        if val:
            hit = lookup.get(val) or lookup.get(val.lower())
            if hit:
                return hit
            raise ValueError(f"No employee matched {key}={val!r}")

    email = row.get("email", "").strip()
    if email:
        hit = lookup.get(email.lower())
        if hit:
            return hit
        raise ValueError(f"No employee matched email={email!r}")

    fn = row.get("first_name", "").strip().lower()
    ln = row.get("last_name", "").strip().lower()
    if fn and ln:
        candidates = name_index.get((fn, ln), [])
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise ValueError(
                f"Ambiguous name {fn!r} {ln!r}: {len(candidates)} employees — use employee_id or email"
            )
        raise ValueError(f"No employee matched name {fn!r} {ln!r}")

    raise ValueError(
        "No employee locator: set one of employee_id, id, email, or first_name+last_name"
    )


def row_to_payload(row: dict[str, str], employee_db_id: str) -> dict[str, Any]:
    interview_date = parse_interview_date(row.get("interview_date", ""))
    interview_type = (row.get("interview_type") or "Stay Interview").strip() or "Stay Interview"

    payload: dict[str, Any] = {
        "employee_id": employee_db_id,
        "interview_date": interview_date,
        "interview_type": interview_type,
    }

    for field in OPTIONAL_STAY_FIELDS:
        if field == "interview_type":
            continue
        if field in row and row[field].strip() != "":
            payload[field] = row[field].strip()

    return payload


def load_csv_rows(path: str) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row")

        out: list[dict[str, str]] = []
        for raw in reader:
            norm: dict[str, str] = {}
            for k, v in raw.items():
                if k is None:
                    continue
                nk = normalize_header(k)
                norm[nk] = (v if v is not None else "").strip()
            if not any(norm.values()):
                continue
            out.append(norm)
        return out


def insert_batch(base_url: str, service_key: str, batch: list[dict[str, Any]]) -> None:
    rest_json("POST", base_url, service_key, "stay_interviews", body=batch)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", help="Path to CSV file")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve employees and validate rows; do not insert",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Rows per insert request (default 50)",
    )
    args = parser.parse_args()

    try:
        rows = load_csv_rows(args.csv_path)
    except OSError as err:
        die(f"Could not read CSV: {err}")
    except ValueError as err:
        die(str(err))

    if not rows:
        eprint("No data rows in CSV (header-only template?). Nothing to import.")
        return

    base_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not base_url or not service_key:
        die(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.\n"
            "Use the service role key only on a trusted machine; never embed it in the app."
        )

    if args.batch_size < 1 or args.batch_size > 500:
        die("--batch-size must be between 1 and 500")

    try:
        employees = fetch_employees(base_url, service_key)
    except Exception as err:
        die(f"Failed to load employees: {err}")

    lookup, name_index = build_employee_indexes(employees)
    eprint(f"Loaded {len(employees)} employees; {len(lookup)} lookup keys.")

    payloads: list[dict[str, Any]] = []
    errors: list[str] = []

    for i, row in enumerate(rows, start=2):
        # +2: 1-based line; header is line 1
        try:
            emp_id = resolve_employee_id(row, lookup, name_index)
            payloads.append(row_to_payload(row, emp_id))
        except ValueError as err:
            errors.append(f"Row {i} (CSV line ~{i}): {err}")

    if errors:
        for msg in errors:
            eprint(msg)
        die(f"Stopping: {len(errors)} row error(s).")

    eprint(f"Prepared {len(payloads)} stay interview row(s).")

    if args.dry_run:
        eprint("--dry-run: no rows inserted.")
        return

    batch_size = args.batch_size
    for start in range(0, len(payloads), batch_size):
        chunk = payloads[start : start + batch_size]
        try:
            insert_batch(base_url, service_key, chunk)
        except Exception as err:
            die(f"Insert failed at offset {start}: {err}")
        eprint(f"Inserted {len(chunk)} row(s) (offset {start}).")

    eprint("Done.")


if __name__ == "__main__":
    main()
