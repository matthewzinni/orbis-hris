#!/usr/bin/env python3
"""
Per-employee HR compliance audit → CSV.

Checks each active roster employee for:
  • Missing emergency contact (no emergency_contacts row)
  • Missing documents (no employee_documents row)
  • Stay interview due within 30 days (next_review_date overdue or due soon)
  • Open discipline (open discipline_reports)

Environment (service role — never commit):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  Loaded from scripts/.env.weekly_report, tools/.env.python, or repo .env

Usage:
  python3 scripts/hr_audit_report.py
  python3 scripts/hr_audit_report.py --output tools/hr_audit_report.csv
  python3 scripts/hr_audit_report.py --stdout
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
from datetime import date, datetime
from pathlib import Path
from typing import Any
REVIEW_DUE_WINDOW_DAYS = 30

CSV_HEADERS = [
    "Employee ID",
    "Name",
    "Missing Emergency Contact",
    "Missing Documents",
    "Review Due (30 days)",
    "Open Discipline",
]


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    eprint(message)
    sys.exit(code)


def load_dotenv_file(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            key = key.strip().strip('"').strip("'").rstrip(",")
            value = value.strip().strip('"').strip("'").rstrip(",")
            if key and value:
                os.environ[key] = value


def bootstrap_config() -> None:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    load_dotenv_file(str(script_dir / ".env.weekly_report"))
    load_dotenv_file(str(repo_root / "tools" / ".env.python"))
    load_dotenv_file(str(repo_root / ".env"))


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    die(
        f"Missing {name}. Set it in scripts/.env.weekly_report or tools/.env.python "
        "(Supabase → Settings → API → service_role secret)."
    )


def resolve_supabase_url() -> str:
    for candidate in (
        os.environ.get("SUPABASE_URL", "").strip(),
        os.environ.get("VITE_SUPABASE_URL", "").strip(),
    ):
        if candidate and "your_project" not in candidate.lower():
            return candidate.rstrip("/")
    die("Set SUPABASE_URL in scripts/.env.weekly_report or tools/.env.python.")
    return ""


def rest_get(
    base_url: str, service_key: str, path: str, query: dict[str, str] | None = None
) -> list[dict[str, Any]]:
    q = urllib.parse.urlencode(query) if query else ""
    url = f"{base_url.rstrip('/')}/rest/v1/{path}"
    if q:
        url = f"{url}?{q}"

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
        "Range": "0-49999",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} on {path}: {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(
            f"Could not reach Supabase for {path}. ({err.reason})"
        ) from err

    rows = json.loads(text) if text.strip() else []
    if not isinstance(rows, list):
        raise RuntimeError(f"Unexpected response for {path}")
    return rows


def parse_iso_date(value: Any) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def days_until(value: Any, today: date) -> int | None:
    parsed = parse_iso_date(value)
    if not parsed:
        return None
    return (parsed - today).days


def is_active_employee(row: dict[str, Any]) -> bool:
    status = str(row.get("status") or "").strip().upper()
    if status == "TERMINATED":
        termination = str(row.get("termination_date") or "").strip()
        return not termination
    return status not in ("INACTIVE", "ARCHIVED")


def employee_display_name(row: dict[str, Any]) -> str:
    first = str(row.get("first_name") or "").strip()
    last = str(row.get("last_name") or "").strip()
    name = f"{first} {last}".strip()
    return name or str(row.get("id") or "Unknown")


def employee_roster_id(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("employee_id") or "").strip()


def discipline_is_open(row: dict[str, Any]) -> bool:
    status = str(row.get("report_status") or row.get("status") or "").strip().lower()
    return status in ("open", "pending follow-up", "pending")


def index_rows_by_employee(rows: list[dict[str, Any]]) -> set[str]:
    indexed: set[str] = set()
    for row in rows:
        employee_id = str(row.get("employee_id") or "").strip()
        if employee_id:
            indexed.add(employee_id)
    return indexed


def index_open_discipline_by_employee(rows: list[dict[str, Any]]) -> set[str]:
    indexed: set[str] = set()
    for row in rows:
        if not discipline_is_open(row):
            continue
        employee_id = str(row.get("employee_id") or "").strip()
        if employee_id:
            indexed.add(employee_id)
    return indexed


def review_due_within_window(employee: dict[str, Any], today: date) -> bool:
    next_review = employee.get("next_review_date") or employee.get("next_stay_interview_date")
    days = days_until(next_review, today)
    return days is not None and days <= REVIEW_DUE_WINDOW_DAYS


def build_audit_rows(base_url: str, service_key: str) -> list[dict[str, str]]:
    today = date.today()

    employees = rest_get(
        base_url,
        service_key,
        "employees",
        {"select": "id,first_name,last_name,status,termination_date,next_review_date"},
    )
    active = [row for row in employees if is_active_employee(row)]
    active.sort(key=lambda row: employee_display_name(row).lower())

    emergency_ids = index_rows_by_employee(
        rest_get(base_url, service_key, "emergency_contacts", {"select": "employee_id"})
    )
    document_ids = index_rows_by_employee(
        rest_get(base_url, service_key, "employee_documents", {"select": "employee_id"})
    )
    discipline_ids = index_open_discipline_by_employee(
        rest_get(
            base_url,
            service_key,
            "discipline_reports",
            {"select": "employee_id,report_status,status"},
        )
    )

    audit_rows: list[dict[str, str]] = []
    for employee in active:
        roster_id = employee_roster_id(employee)
        if not roster_id:
            continue

        audit_rows.append(
            {
                "Employee ID": roster_id,
                "Name": employee_display_name(employee),
                "Missing Emergency Contact": "True"
                if roster_id not in emergency_ids
                else "False",
                "Missing Documents": "True" if roster_id not in document_ids else "False",
                "Review Due (30 days)": "True"
                if review_due_within_window(employee, today)
                else "False",
                "Open Discipline": "True" if roster_id in discipline_ids else "False",
            }
        )

    return audit_rows


def print_summary(rows: list[dict[str, str]]) -> None:
    total = len(rows)
    if not total:
        eprint("No active employees found.")
        return

    def count_true(column: str) -> int:
        return sum(1 for row in rows if row.get(column) == "True")

    eprint(f"Active employees audited: {total}")
    eprint(f"  Missing emergency contact: {count_true('Missing Emergency Contact')}")
    eprint(f"  Missing documents:       {count_true('Missing Documents')}")
    eprint(f"  Review due (30 days):    {count_true('Review Due (30 days)')}")
    eprint(f"  Open discipline:         {count_true('Open Discipline')}")


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_HEADERS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    bootstrap_config()

    parser = argparse.ArgumentParser(description="Orbis per-employee HR compliance audit")
    parser.add_argument(
        "--output",
        "-o",
        default="tools/hr_audit_report.csv",
        help="CSV output path (default: tools/hr_audit_report.csv)",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Write CSV to stdout instead of a file",
    )
    args = parser.parse_args()

    base_url = resolve_supabase_url()
    service_key = env_required("SUPABASE_SERVICE_ROLE_KEY")

    rows = build_audit_rows(base_url, service_key)
    print_summary(rows)

    if args.stdout:
        writer = csv.DictWriter(sys.stdout, fieldnames=CSV_HEADERS)
        writer.writeheader()
        writer.writerows(rows)
        return

    repo_root = Path(__file__).resolve().parent.parent
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = repo_root / output_path

    write_csv(output_path, rows)
    print(f"Wrote {len(rows)} rows to {output_path}")


if __name__ == "__main__":
    main()
