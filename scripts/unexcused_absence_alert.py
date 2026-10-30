#!/usr/bin/env python3
"""
Email HR and the employee's supervisor when an employee reaches the unexcused absence limit.

Rule: ATTENDANCE_UNEXCUSED_LIMIT (default 4) unexcused absences in a rolling
ATTENDANCE_UNEXCUSED_WINDOW_DAYS (default 90) days. Keep the defaults in sync with
src/services/attendanceAbsenceReport.ts.

An absence is unexcused when roll call saved it with Excused unticked (excused: false) and no
approved leave request covers that day. Roll calls saved before the Excused box existed have no
flag and are never counted.

Each alert is recorded in attendance_unexcused_alerts, keyed by the newest unexcused absence, so
an employee is emailed once when they reach the limit and once more for each new unexcused
absence while still over it.

Environment (same file and secrets as weekly_orbis_report_email.py):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
  ATTENDANCE_ALERT_MAIL_TO (optional; HR recipients, defaults to MAIL_TO)
  ATTENDANCE_ALERT_NOTIFY_SUPERVISORS (optional; "false" to email HR only)
  ATTENDANCE_UNEXCUSED_LIMIT, ATTENDANCE_UNEXCUSED_WINDOW_DAYS (optional overrides)
  ATTENDANCE_ALERT_TIMEZONE (optional; default America/New_York)

Usage:
  python3 scripts/unexcused_absence_alert.py --dry-run   # print who would be emailed, send nothing
  python3 scripts/unexcused_absence_alert.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

from weekly_orbis_report_email import (
    DEFAULT_MAIL_TO,
    _orbis_letterhead_html,
    bootstrap_config,
    die,
    env_required,
    eprint,
    employee_display_name,
    fmt_date,
    parse_iso_date,
    resolve_supabase_url,
    rest_get,
    send_email_with_retries,
)

ALERTS_TABLE = "attendance_unexcused_alerts"


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        die(f"{name} must be a whole number (got {raw!r}).")
        return default


def split_emails(raw: str) -> list[str]:
    return [part.strip() for part in raw.replace(";", ",").split(",") if part.strip()]


def normalize_name(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def person_key(person: dict[str, Any]) -> str:
    """Mirror personRollupKey in src/services/attendanceAbsenceReport.ts."""
    employee_id = str(
        person.get("employeeId") or person.get("employee_id") or person.get("id") or ""
    ).strip().lower()
    if employee_id and employee_id != "—":
        return f"id:{employee_id}"
    name = str(person.get("name") or "").strip().lower()
    return f"name:{name}"


def employee_keys(row: dict[str, Any]) -> set[str]:
    keys = {f"id:{str(row.get('id') or '').strip().lower()}"}
    name = employee_display_name(row).strip().lower()
    if name:
        keys.add(f"name:{name}")
    return keys


def approved_leave_dates(leave_rows: list[dict[str, Any]], start: date, end: date) -> dict[str, set[date]]:
    """Employee id -> days covered by approved leave inside [start, end]."""
    covered: dict[str, set[date]] = {}
    for row in leave_rows:
        first = parse_iso_date(row.get("start_date"))
        if not first:
            continue
        last = parse_iso_date(row.get("end_date")) or first
        day = max(first, start)
        while day <= min(last, end):
            covered.setdefault(str(row.get("employee_id") or "").strip(), set()).add(day)
            day += timedelta(days=1)
    return covered


def collect_unexcused(
    snapshots: list[dict[str, Any]],
    employees: list[dict[str, Any]],
    leave_by_employee: dict[str, set[date]],
) -> dict[str, dict[str, Any]]:
    """Employee id -> {employee, dates} for unexcused absences in the snapshots given."""
    by_key: dict[str, dict[str, Any]] = {}
    for employee in employees:
        for key in employee_keys(employee):
            by_key.setdefault(key, employee)

    result: dict[str, dict[str, Any]] = {}
    for snapshot in snapshots:
        day = parse_iso_date(snapshot.get("attendance_date"))
        absent = snapshot.get("absent")
        if not day or not isinstance(absent, list):
            continue
        for person in absent:
            if not isinstance(person, dict) or person.get("excused") is not False:
                continue
            employee = by_key.get(person_key(person))
            if not employee:
                continue
            employee_id = str(employee.get("id") or "").strip()
            if day in leave_by_employee.get(employee_id, set()):
                continue
            entry = result.setdefault(employee_id, {"employee": employee, "dates": set()})
            entry["dates"].add(day)
    return result


def supervisor_emails(employee: dict[str, Any], access_rows: list[dict[str, Any]]) -> list[str]:
    """Approved supervisors who see this employee: explicit ID list first, else supervisor name."""
    employee_id = str(employee.get("id") or "").strip()
    supervisor_name = normalize_name(employee.get("supervisor"))
    emails: list[str] = []
    for row in access_rows:
        if str(row.get("role") or "").strip().lower() != "supervisor":
            continue
        if str(row.get("approval_status") or "approved").strip().lower() != "approved":
            continue
        email = str(row.get("email") or "").strip()
        if not email:
            continue
        ids = [str(value).strip() for value in (row.get("supervised_employee_ids") or [])]
        if ids:
            matched = employee_id in ids
        else:
            matched = bool(supervisor_name) and normalize_name(row.get("supervisor_name")) == supervisor_name
        if matched and email.lower() not in (e.lower() for e in emails):
            emails.append(email)
    return emails


def rest_insert(base_url: str, service_key: str, table: str, row: dict[str, Any]) -> bool:
    """Insert one row. Returns False when the unique key already exists (alert already sent)."""
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/rest/v1/{table}",
        data=json.dumps(row).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            return True
    except urllib.error.HTTPError as err:
        if err.code == 409:
            return False
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} inserting into {table}: {detail}") from err


def build_alert_html(
    employee: dict[str, Any],
    dates: list[date],
    limit: int,
    window_days: int,
    today: date,
) -> str:
    app_url = os.environ.get("ORBIS_APP_URL", "").strip()
    name = escape(employee_display_name(employee))
    rows = "".join(
        f'<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">{escape(fmt_date(day.isoformat()))}</td></tr>'
        for day in dates
    )
    link = (
        f'<p style="margin-top:20px;"><a href="{escape(app_url)}" style="color:#1d4ed8;">Open Orbis → Attendance</a></p>'
        if app_url
        else ""
    )
    return f"""\
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;">
{_orbis_letterhead_html("Unexcused Absence Alert", escape(today.strftime("%b %d, %Y")))}
  <p><strong>{name}</strong> ({escape(str(employee.get("id") or ""))}) has
  <strong>{len(dates)} unexcused absences</strong> in the past {window_days} days.
  The limit is {limit}.</p>
  <p style="color:#475569;">Department: {escape(str(employee.get("department") or "—"))} ·
  Supervisor: {escape(str(employee.get("supervisor") or "—"))}</p>
  <table style="border-collapse:collapse;margin-top:12px;">
    <tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #cbd5e1;">Unexcused absence dates</th></tr>
    {rows}
  </table>
  <p style="margin-top:20px;">Next step: review the dates in Orbis, mark any that should be excused,
  and decide on corrective action under the attendance policy. No warning has been issued to the
  employee by this email.</p>
  {link}
</body></html>"""


def main() -> None:
    bootstrap_config()

    parser = argparse.ArgumentParser(description="Email unexcused absence limit alerts")
    parser.add_argument("--dry-run", action="store_true", help="Print alerts; send and record nothing")
    args = parser.parse_args()

    limit = env_int("ATTENDANCE_UNEXCUSED_LIMIT", 4)
    window_days = env_int("ATTENDANCE_UNEXCUSED_WINDOW_DAYS", 90)
    tz_name = os.environ.get("ATTENDANCE_ALERT_TIMEZONE", "").strip() or "America/New_York"
    today = datetime.now(ZoneInfo(tz_name)).date()
    window_start = today - timedelta(days=window_days - 1)

    base_url = resolve_supabase_url()
    service_key = env_required("SUPABASE_SERVICE_ROLE_KEY")

    hr_raw = os.environ.get("ATTENDANCE_ALERT_MAIL_TO", "").strip() or os.environ.get("MAIL_TO", "").strip()
    hr_recipients = split_emails(hr_raw or DEFAULT_MAIL_TO)
    notify_supervisors = os.environ.get("ATTENDANCE_ALERT_NOTIFY_SUPERVISORS", "true").strip().lower() != "false"

    snapshots = rest_get(
        base_url,
        service_key,
        "attendance_manual_snapshots",
        {
            "select": "attendance_date,absent",
            "and": f"(attendance_date.gte.{window_start.isoformat()},attendance_date.lte.{today.isoformat()})",
        },
    )
    employees = rest_get(
        base_url,
        service_key,
        "employees",
        {"select": "id,first_name,last_name,department,supervisor,status"},
    )
    leave_rows = rest_get(
        base_url,
        service_key,
        "leave_requests",
        {"select": "employee_id,start_date,end_date", "status": "eq.approved"},
    )
    access_rows = (
        rest_get(
            base_url,
            service_key,
            "user_access",
            {"select": "email,role,supervisor_name,supervised_employee_ids,approval_status"},
        )
        if notify_supervisors
        else []
    )
    sent_rows = rest_get(base_url, service_key, ALERTS_TABLE, {"select": "employee_id,trigger_date"})
    already_sent = {
        (str(row.get("employee_id") or ""), str(row.get("trigger_date") or "")[:10]) for row in sent_rows
    }

    leave_by_employee = approved_leave_dates(leave_rows, window_start, today)
    unexcused = collect_unexcused(snapshots, employees, leave_by_employee)

    alerts = 0
    for employee_id, entry in sorted(unexcused.items()):
        dates = sorted(entry["dates"], reverse=True)
        if len(dates) < limit:
            continue
        trigger = dates[0].isoformat()
        if (employee_id, trigger) in already_sent:
            continue

        employee = entry["employee"]
        recipients = list(hr_recipients)
        for email in supervisor_emails(employee, access_rows):
            if email.lower() not in (r.lower() for r in recipients):
                recipients.append(email)

        subject = f"Orbis attendance alert: {employee_display_name(employee)} — {len(dates)} unexcused absences"
        alerts += 1

        if args.dry_run:
            print(f"[dry run] {subject}")
            print(f"          dates: {', '.join(day.isoformat() for day in dates)}")
            print(f"          to: {', '.join(recipients)}")
            continue

        html = build_alert_html(employee, dates, limit, window_days, today)
        send_email_with_retries(subject, html, recipients)
        recorded = rest_insert(
            base_url,
            service_key,
            ALERTS_TABLE,
            {
                "employee_id": employee_id,
                "trigger_date": trigger,
                "unexcused_count": len(dates),
                "window_days": window_days,
                "absence_dates": [day.isoformat() for day in dates],
                "sent_to": recipients,
            },
        )
        if not recorded:
            eprint(f"Alert for {employee_id} on {trigger} was already recorded by another run.")
        print(f"Sent: {subject} → {', '.join(recipients)}")

    if not alerts:
        print(f"No new alerts ({limit}+ unexcused in {window_days} days, as of {today.isoformat()}).")


if __name__ == "__main__":
    main()
