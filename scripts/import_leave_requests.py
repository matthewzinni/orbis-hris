#!/usr/bin/env python3
"""
Import approved / historical time off from a CSV into public.leave_requests.

Designed for QuickBooks Time (TSheets) exports: Team Member, Days Off, Duration,
Code, Submitted On, Status — but any CSV with employee_id + start_date works.

Environment (required):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 scripts/import_leave_requests.py path/to/time_off.csv --dry-run
  python3 scripts/import_leave_requests.py path/to/time_off.csv

See scripts/examples/leave_requests_template.csv and scripts/README.md.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from typing import Any


LEAVE_TYPES = frozenset({"pto", "sick", "bereavement", "fmla", "unpaid", "other"})
STATUSES = frozenset({"requested", "approved", "denied", "cancelled"})

CODE_TO_LEAVE_TYPE = {
    "paid time off (pto)": "pto",
    "paid time off": "pto",
    "pto": "pto",
    "vacation": "pto",
    "sick": "sick",
    "sick leave": "sick",
    "bereavement": "bereavement",
    "fmla": "fmla",
    "unpaid": "unpaid",
    "unpaid time off": "unpaid",
    "holiday": "other",
    "other": "other",
}


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    eprint(message)
    sys.exit(code)


def normalize_header(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def parse_iso_date(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise ValueError("date is empty")
    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y/%m/%d",
        "%b %d, %Y",
        "%B %d, %Y",
    ):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Could not parse date {s!r}")


def parse_days_off(raw: str) -> tuple[str, str | None]:
    """Parse TSheets 'Days Off' like 'Jun 26, 2026' or 'Aug 20 - 24, 2026'."""
    s = (raw or "").strip()
    if not s:
        raise ValueError("days_off is empty")

    if " - " in s:
        left, right = s.split(" - ", 1)
        left = left.strip()
        right = right.strip()

        # Range often omits month/year on the left: "Aug 20 - 24, 2026"
        if re.search(r",\s*\d{4}\s*$", right) and not re.search(r",\s*\d{4}\s*$", left):
            month = left.split()[0]
            year_match = re.search(r",\s*(\d{4})\s*$", right)
            year = year_match.group(1) if year_match else ""
            day_match = re.match(r"^[A-Za-z]+\s+(\d{1,2})\b", left)
            end_day_match = re.match(r"^(\d{1,2})\b", right)
            if day_match and end_day_match and year:
                start = parse_iso_date(f"{month} {day_match.group(1)}, {year}")
                end = parse_iso_date(f"{month} {end_day_match.group(1)}, {year}")
                return start, end

        start = parse_iso_date(left)
        end = parse_iso_date(right)
        return start, end

    day = parse_iso_date(s)
    return day, None


def parse_hours(raw: str) -> float | None:
    s = (raw or "").strip()
    if not s:
        return None

    if re.fullmatch(r"-?\d+(\.\d+)?", s):
        return float(s)

    match = re.match(r"^(\d+(?:\.\d+)?)\s*h(?:\s*\d+\s*m)?", s, re.IGNORECASE)
    if match:
        return float(match.group(1))

    match = re.match(r"^(\d+(?:\.\d+)?)\s*hr", s, re.IGNORECASE)
    if match:
        return float(match.group(1))

    raise ValueError(f"Could not parse hours/duration {s!r}")


def map_leave_type(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return "pto"
    key = s.lower()
    if key in LEAVE_TYPES:
        return key
    if key in CODE_TO_LEAVE_TYPE:
        return CODE_TO_LEAVE_TYPE[key]
    for needle, mapped in CODE_TO_LEAVE_TYPE.items():
        if needle in key:
            return mapped
    return "other"


def map_status(raw: str, default: str) -> str:
    s = (raw or "").strip().lower()
    if not s:
        return default
    if s in STATUSES:
        return s
    if s == "declined":
        return "denied"
    raise ValueError(f"Unknown status {raw!r}")


def split_full_name(raw: str) -> tuple[str, str]:
    s = re.sub(r"\s*\(you\)\s*", "", (raw or "").strip(), flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        raise ValueError("team member name is empty")
    parts = s.split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def rest_json(
    method: str,
    base_url: str,
    service_key: str,
    path: str,
    query: dict[str, str] | None = None,
    body: Any | None = None,
    prefer: str | None = None,
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
        headers["Prefer"] = prefer or "return=minimal"

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
) -> tuple[dict[str, str], dict[tuple[str, str], list[str]], dict[str, str]]:
    lookup: dict[str, str] = {}
    name_index: dict[tuple[str, str], list[str]] = defaultdict(list)
    display_name_index: dict[str, str] = {}

    for row in rows:
        emp_id = str(row.get("id") or "").strip()
        if not emp_id:
            continue

        alt = str(row.get("employee_id") or "").strip()
        if alt:
            lookup.setdefault(alt, emp_id)
            lookup.setdefault(alt.lower(), emp_id)

        lookup.setdefault(emp_id, emp_id)

        email = str(row.get("email") or "").strip()
        if email:
            lookup.setdefault(email.lower(), emp_id)

        fn = str(row.get("first_name") or "").strip().lower()
        ln = str(row.get("last_name") or "").strip().lower()
        if fn and ln:
            name_index[(fn, ln)].append(emp_id)
            display = f"{fn} {ln}"
            display_name_index.setdefault(display, emp_id)
            display_name_index.setdefault(f"{ln}, {fn}", emp_id)

    return lookup, name_index, display_name_index


def resolve_employee_id(
    row: dict[str, str],
    lookup: dict[str, str],
    name_index: dict[tuple[str, str], list[str]],
    display_name_index: dict[str, str],
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

    for name_key in ("team_member", "employee_name", "name", "full_name"):
        raw = row.get(name_key, "").strip()
        if raw:
            hit = display_name_index.get(raw.lower())
            if hit:
                return hit
            fn, ln = split_full_name(raw)
            if ln:
                candidates = name_index.get((fn.lower(), ln.lower()), [])
                if len(candidates) == 1:
                    return candidates[0]
                if len(candidates) > 1:
                    raise ValueError(
                        f"Ambiguous name {raw!r}: {len(candidates)} employees — use employee_id"
                    )
            raise ValueError(f"No employee matched {name_key}={raw!r}")

    fn = row.get("first_name", "").strip().lower()
    ln = row.get("last_name", "").strip().lower()
    if fn and ln:
        candidates = name_index.get((fn, ln), [])
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise ValueError(
                f"Ambiguous name {fn!r} {ln!r}: {len(candidates)} employees — use employee_id"
            )
        raise ValueError(f"No employee matched name {fn!r} {ln!r}")

    raise ValueError(
        "No employee locator: set employee_id, email, team_member, or first_name+last_name"
    )


def row_to_payload(
    row: dict[str, str],
    employee_db_id: str,
    default_status: str,
    import_actor: str,
    source_label: str,
) -> dict[str, Any]:
    if row.get("start_date", "").strip():
        start_date = parse_iso_date(row["start_date"])
        end_raw = row.get("end_date", "").strip()
        end_date = parse_iso_date(end_raw) if end_raw else None
    elif row.get("days_off", "").strip():
        start_date, end_date = parse_days_off(row["days_off"])
    else:
        raise ValueError("Need start_date or days_off")

    hours_raw = row.get("hours") or row.get("duration") or ""
    hours = parse_hours(hours_raw) if str(hours_raw).strip() else None

    leave_type = map_leave_type(row.get("leave_type") or row.get("code") or row.get("type") or "")
    status = map_status(row.get("status", ""), default_status)

    notes_parts: list[str] = []
    if source_label:
        notes_parts.append(f"Imported from {source_label}.")
    submitted = row.get("submitted_on") or row.get("submitted") or ""
    if submitted.strip():
        notes_parts.append(f"Submitted {submitted.strip()}.")
    if row.get("notes", "").strip():
        notes_parts.append(row["notes"].strip())
    if leave_type == "other" and row.get("code", "").strip():
        notes_parts.append(f"Original code: {row['code'].strip()}.")

    payload: dict[str, Any] = {
        "employee_id": employee_db_id,
        "leave_type": leave_type,
        "start_date": start_date,
        "end_date": end_date,
        "hours": hours,
        "status": status,
        "intermittent": str(row.get("intermittent", "")).strip().lower() in ("1", "true", "yes"),
        "notes": " ".join(notes_parts) if notes_parts else None,
        "payroll_notified": False,
        "deduct_from_pto_balance": False,
        "created_by": import_actor,
    }

    if status == "approved":
        approved_at = row.get("approved_at", "").strip()
        if approved_at:
            try:
                payload["approved_at"] = parse_iso_date(approved_at) + "T12:00:00Z"
            except ValueError:
                payload["approved_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        elif submitted.strip():
            try:
                payload["approved_at"] = parse_iso_date(submitted) + "T12:00:00Z"
            except ValueError:
                payload["approved_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        else:
            payload["approved_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        payload["approved_by"] = row.get("approved_by", "").strip() or import_actor

    return payload


def dedupe_key(payload: dict[str, Any]) -> tuple[str, str, str | None, float | None, str]:
    return (
        str(payload["employee_id"]),
        str(payload["start_date"]),
        payload.get("end_date"),
        payload.get("hours"),
        str(payload["leave_type"]),
    )


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
                norm[normalize_header(k)] = (v if v is not None else "").strip()
            if not any(norm.values()):
                continue
            out.append(norm)
        return out


def fetch_existing_keys(base_url: str, service_key: str) -> set[tuple[str, str, str | None, float | None, str]]:
    url = f"{base_url.rstrip('/')}/rest/v1/leave_requests?select=employee_id,start_date,end_date,hours,leave_type"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
        "Range": "0-99999",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        rows = json.loads(resp.read().decode("utf-8"))

    keys: set[tuple[str, str, str | None, float | None, str]] = set()
    for row in rows if isinstance(rows, list) else []:
        end = row.get("end_date")
        end_norm = str(end)[:10] if end else None
        hours = row.get("hours")
        hours_norm = float(hours) if hours is not None else None
        keys.add(
            (
                str(row.get("employee_id") or ""),
                str(row.get("start_date") or "")[:10],
                end_norm,
                hours_norm,
                str(row.get("leave_type") or ""),
            )
        )
    return keys


def insert_batch(base_url: str, service_key: str, batch: list[dict[str, Any]]) -> None:
    rest_json("POST", base_url, service_key, "leave_requests", body=batch)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", help="Path to CSV export")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and resolve employees; do not insert",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Rows per insert request (default 100)",
    )
    parser.add_argument(
        "--default-status",
        default="approved",
        choices=sorted(STATUSES),
        help="Status when CSV Status column is blank (default approved for QBT history)",
    )
    parser.add_argument(
        "--skip-duplicates",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Skip rows that match an existing leave_requests row (default on)",
    )
    parser.add_argument(
        "--source-label",
        default="QuickBooks Time",
        help="Label stored in notes for traceability",
    )
    args = parser.parse_args()

    try:
        rows = load_csv_rows(args.csv_path)
    except OSError as err:
        die(f"Could not read CSV: {err}")
    except ValueError as err:
        die(str(err))

    if not rows:
        eprint("No data rows in CSV. Nothing to import.")
        return

    base_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    import_actor = os.environ.get("IMPORT_ACTOR_EMAIL", "import:leave-requests").strip()

    if not base_url or not service_key:
        die(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.\n"
            "Use the service role key only on a trusted machine."
        )

    if args.batch_size < 1 or args.batch_size > 500:
        die("--batch-size must be between 1 and 500")

    try:
        employees = fetch_employees(base_url, service_key)
    except Exception as err:
        die(f"Failed to load employees: {err}")

    lookup, name_index, display_name_index = build_employee_indexes(employees)
    eprint(f"Loaded {len(employees)} employees.")

    existing_keys: set[tuple[str, str, str | None, float | None, str]] = set()
    if args.skip_duplicates and not args.dry_run:
        try:
            existing_keys = fetch_existing_keys(base_url, service_key)
            eprint(f"Found {len(existing_keys)} existing leave request(s) for dedupe.")
        except Exception as err:
            die(f"Failed to load existing leave_requests: {err}")

    payloads: list[dict[str, Any]] = []
    errors: list[str] = []
    skipped = 0

    for i, row in enumerate(rows, start=2):
        try:
            emp_id = resolve_employee_id(row, lookup, name_index, display_name_index)
            payload = row_to_payload(
                row,
                emp_id,
                args.default_status,
                import_actor,
                args.source_label,
            )
            key = dedupe_key(payload)
            if args.skip_duplicates and key in existing_keys:
                skipped += 1
                continue
            payloads.append(payload)
            existing_keys.add(key)
        except ValueError as err:
            errors.append(f"Row {i}: {err}")

    if errors:
        for msg in errors:
            eprint(msg)
        die(f"Stopping: {len(errors)} row error(s).")

    eprint(f"Prepared {len(payloads)} leave row(s); skipped {skipped} duplicate(s).")

    if args.dry_run:
        eprint("--dry-run: no rows inserted.")
        if payloads:
            eprint("Sample row:", json.dumps(payloads[0], indent=2))
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
