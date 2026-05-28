#!/usr/bin/env python3
"""
Email a weekly Orbis HR snapshot to HR leadership.

Default recipient: matthew.zinni@btwglobal.com (override with MAIL_TO).

Environment:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — read workforce data (service role; never commit)
  SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS — outbound mail
  MAIL_FROM (optional, defaults to SMTP_USER)
  MAIL_TO (optional, defaults to matthew.zinni@btwglobal.com)
  ORBIS_APP_URL (optional link in footer, e.g. https://www.orbis-btw.com)

Usage:
  python3 scripts/weekly_orbis_report_email.py --dry-run   # print HTML, do not send
  python3 scripts/weekly_orbis_report_email.py

Schedule (macOS cron — every Monday 8:00 AM local):
  0 8 * * 1 cd /path/to/Orbis && /usr/bin/python3 scripts/weekly_orbis_report_email.py >> scripts/logs/weekly_report.log 2>&1
"""

from __future__ import annotations

import argparse
import json
import os
import smtplib
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from typing import Any
from urllib.parse import urlparse

DEFAULT_MAIL_TO = "matthew.zinni@btwglobal.com"

# BTW Global / Orbis — defaults (env file or OS env overrides these).
# Paste only the two secrets below, or put them in scripts/.env.weekly_report (gitignored).
ORBIS_WEEKLY_CONFIG: dict[str, str] = {
    "SUPABASE_URL": "https://fxljbnyarfwnqgheywgw.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "",
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USER": "matthew.zinni@btwglobal.com",
    "SMTP_PASS": "",
    "MAIL_FROM": "matthew.zinni@btwglobal.com",
    "MAIL_TO": "matthew.zinni@btwglobal.com",
    "ORBIS_APP_URL": "https://www.orbis-btw.com",
}


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    eprint(message)
    sys.exit(code)


def load_dotenv_file(path: str, *, override: bool = False, force_from_file: bool = False) -> None:
    """Set os.environ for KEY=VALUE lines."""
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
            if not key:
                continue
            if force_from_file:
                if value:
                    os.environ[key] = value
                else:
                    os.environ.pop(key, None)
                continue
            if not value:
                continue
            if override or key not in os.environ:
                os.environ[key] = value


def weekly_env_path() -> str:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, ".env.weekly_report")


def bootstrap_config() -> None:
    """Load ORBIS_WEEKLY_CONFIG, then scripts/.env.weekly_report, then repo .env for Supabase URL."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)

    for key, value in ORBIS_WEEKLY_CONFIG.items():
        if value and not os.environ.get(key):
            os.environ[key] = value

    load_dotenv_file(weekly_env_path(), force_from_file=True)
    load_dotenv_file(os.path.join(repo_root, ".env"))


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value

    env_path = weekly_env_path()
    if os.path.isfile(env_path):
        for line in open(env_path, encoding="utf-8"):
            stripped = line.strip()
            if not stripped.startswith(f"{name}="):
                continue
            file_value = stripped.partition("=")[2].strip().strip('"').strip("'")
            if file_value:
                os.environ[name] = file_value
                return file_value
            die(
                f"{name} is on a line in scripts/.env.weekly_report but has no value after '='.\n"
                f"  Save the file (Cmd+S), paste your key on the same line, no spaces:\n"
                f"  {name}=your-full-secret-here"
            )

    die(
        f"Missing {name}. Add it to scripts/.env.weekly_report "
        f"(next to weekly_orbis_report_email.py) and save the file."
    )


def is_placeholder_supabase_host(host: str) -> bool:
    lowered = host.lower()
    return not lowered or "your_project" in lowered or lowered.startswith("your_")


def resolve_supabase_url() -> str:
    """SUPABASE_URL, or VITE_SUPABASE_URL from repo .env when weekly env still has placeholders."""
    url = ""
    for candidate in (
        os.environ.get("SUPABASE_URL", "").strip(),
        os.environ.get("VITE_SUPABASE_URL", "").strip(),
    ):
        if not candidate:
            continue
        host = (urlparse(candidate).hostname or "").lower()
        if is_placeholder_supabase_host(host):
            continue
        url = candidate
        break

    if not url:
        die(
            "Set SUPABASE_URL in scripts/.env.weekly_report to your real project URL "
            "(e.g. https://fxljbnyarfwnqgheywgw.supabase.co — Supabase → Settings → API)."
        )

    return url.rstrip("/")


def rest_get(base_url: str, service_key: str, path: str, query: dict[str, str] | None = None) -> list[dict[str, Any]]:
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
        if err.code in (401, 403):
            raise RuntimeError(
                f"Supabase rejected the service role key (HTTP {err.code}) on {path}. "
                "Set SUPABASE_SERVICE_ROLE_KEY in scripts/.env.weekly_report "
                "(Supabase → Settings → API → service_role secret)."
            ) from err
        raise RuntimeError(f"HTTP {err.code} on {path}: {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(
            f"Could not reach Supabase at {urlparse(url).hostname!r} for {path}. "
            f"Check SUPABASE_URL. ({err.reason})"
        ) from err

    rows = json.loads(text) if text.strip() else []
    if not isinstance(rows, list):
        raise RuntimeError(f"Unexpected response for {path}")
    return rows


def is_active_employee(row: dict[str, Any]) -> bool:
    status = str(row.get("status") or row.get("displayStatus") or "").strip().upper()
    if status == "TERMINATED":
        termination = str(row.get("termination_date") or row.get("terminationDate") or "").strip()
        return not termination
    return status not in ("INACTIVE", "ARCHIVED")


def parse_iso_date(value: Any) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def fmt_date(value: Any) -> str:
    parsed = parse_iso_date(value)
    return parsed.strftime("%b %d, %Y") if parsed else "—"


def employee_display_name(row: dict[str, Any]) -> str:
    first = str(row.get("first_name") or "").strip()
    last = str(row.get("last_name") or "").strip()
    name = f"{first} {last}".strip()
    return name or str(row.get("id") or "Unknown")


def get_employee_status(row: dict[str, Any]) -> str:
    return str(row.get("status") or row.get("displayStatus") or "").strip().upper()


def is_on_leave(row: dict[str, Any]) -> bool:
    return get_employee_status(row) in ("LEAVE", "ON LEAVE")


def is_completed_termination(row: dict[str, Any]) -> bool:
    return get_employee_status(row) == "TERMINATED" and bool(
        str(row.get("termination_date") or row.get("terminationDate") or "").strip()
    )


def build_at_risk_employee_ids(notes: list[dict[str, Any]]) -> set[str]:
    """Latest At-Risk Flag / At-Risk Cleared note per employee (matches dashboard logic)."""
    latest: dict[str, tuple[str, str]] = {}
    for note in notes:
        employee_id = str(note.get("employee_id") or "").strip()
        if not employee_id:
            continue
        note_type = str(note.get("note_type") or "").strip()
        if note_type not in ("At-Risk Flag", "At-Risk Cleared"):
            continue
        created = str(note.get("created_at") or note.get("note_date") or "")
        previous = latest.get(employee_id)
        if previous is None or created >= previous[0]:
            latest[employee_id] = (created, note_type)
    return {
        employee_id
        for employee_id, (_, note_type) in latest.items()
        if note_type == "At-Risk Flag"
    }


def tenure_months(row: dict[str, Any], today: date) -> int:
    hired = parse_iso_date(row.get("hire_date") or row.get("hireDate"))
    if not hired:
        return 0
    months = (today.year - hired.year) * 12 + (today.month - hired.month)
    if today.day < hired.day:
        months -= 1
    return max(0, months)


def turnover_ytd_percent(employees: list[dict[str, Any]], active_count: int, year: int) -> str:
    ytd_sep = sum(
        1
        for row in employees
        if (term := parse_iso_date(row.get("termination_date"))) is not None
        and term.year == year
    )
    denom = active_count + ytd_sep
    if not denom:
        return "0%"
    return f"{round(ytd_sep / denom * 100)}%"


def discipline_is_open(row: dict[str, Any]) -> bool:
    status = str(row.get("report_status") or row.get("status") or "").strip().lower()
    return status in ("open", "pending follow-up", "pending")


def investigation_is_open(row: dict[str, Any]) -> bool:
    return str(row.get("status") or "").strip().lower() != "closed"


def investigation_is_overdue(row: dict[str, Any], today: date) -> bool:
    if not investigation_is_open(row):
        return False
    target = parse_iso_date(row.get("target_completion_date"))
    return target is not None and target < today


def operations_is_open(row: dict[str, Any]) -> bool:
    return str(row.get("status") or "").strip().lower() not in ("resolved", "closed")


def collect_metrics(base_url: str, service_key: str) -> dict[str, Any]:
    today = date.today()
    employees = rest_get(
        base_url,
        service_key,
        "employees",
        {
            "select": (
                "id,first_name,last_name,status,termination_date,hire_date,"
                "next_review_date,department"
            )
        },
    )

    at_risk_ids: set[str] = set()
    try:
        risk_notes = rest_get(
            base_url,
            service_key,
            "employee_notes",
            {
                "select": "employee_id,note_type,note_date,created_at",
                "note_type": "in.(At-Risk Flag,At-Risk Cleared)",
            },
        )
        at_risk_ids = build_at_risk_employee_ids(risk_notes)
    except RuntimeError as err:
        eprint(f"[warn] employee_notes (at-risk): {err}")

    employee_by_id = {str(row.get("id")): row for row in employees if row.get("id")}
    active = [row for row in employees if is_active_employee(row)]
    on_leave = sum(1 for row in active if is_on_leave(row))
    at_risk_active = [row for row in active if str(row.get("id")) in at_risk_ids]

    stay_due_entries: list[tuple[date, dict[str, Any]]] = []
    new_hires_list: list[list[str]] = []
    for row in active:
        next_due = parse_iso_date(
            row.get("next_review_date") or row.get("next_stay_interview_date")
        )
        if next_due is not None and next_due <= today:
            stay_due_entries.append((next_due, row))
        months = tenure_months(row, today)
        if months <= 3:
            new_hires_list.append(
                [
                    employee_display_name(row),
                    str(row.get("department") or "Unassigned").strip() or "Unassigned",
                    f"{months} mo",
                    fmt_date(row.get("hire_date")),
                ]
            )

    stay_due_entries.sort(key=lambda item: item[0])
    stay_due_list = [
        [
            employee_display_name(row),
            str(row.get("department") or "Unassigned").strip() or "Unassigned",
            fmt_date(due),
        ]
        for due, row in stay_due_entries
    ]
    new_hires_list.sort(key=lambda item: item[0].lower())

    at_risk_list = sorted(
        [
            [
                employee_display_name(row),
                str(row.get("department") or "Unassigned").strip() or "Unassigned",
            ]
            for row in at_risk_active
        ],
        key=lambda item: item[0].lower(),
    )

    terminated_tracking = sorted(
        [
            [
                employee_display_name(row),
                fmt_date(row.get("termination_date")),
            ]
            for row in employees
            if is_completed_termination(row)
        ],
        key=lambda item: item[1],
        reverse=True,
    )[:15]

    departments: dict[str, int] = {}
    for row in active:
        dept = str(row.get("department") or "Unassigned").strip() or "Unassigned"
        departments[dept] = departments.get(dept, 0) + 1

    all_departments = sorted(departments.items(), key=lambda item: (-item[1], item[0]))

    open_investigations = 0
    high_severity_investigations = 0
    investigations_overdue = 0
    investigations_open_list: list[list[str]] = []
    investigations: list[dict[str, Any]] = []
    try:
        investigations = rest_get(
            base_url,
            service_key,
            "investigations",
            {
                "select": (
                    "id,status,severity,case_number,title,category,"
                    "target_completion_date,opened_at,created_at"
                )
            },
        )
        for inv in investigations:
            if not investigation_is_open(inv):
                continue
            open_investigations += 1
            severity = str(inv.get("severity") or "").strip().lower()
            if severity in ("high", "critical"):
                high_severity_investigations += 1
            if investigation_is_overdue(inv, today):
                investigations_overdue += 1
            investigations_open_list.append(
                [
                    str(inv.get("case_number") or inv.get("id") or "—"),
                    str(inv.get("title") or "—").strip() or "—",
                    str(inv.get("status") or "—"),
                    str(inv.get("severity") or "—"),
                    fmt_date(inv.get("target_completion_date")),
                ]
            )
        investigations_open_list.sort(key=lambda item: item[0])
    except RuntimeError as err:
        eprint(f"[warn] investigations: {err}")

    open_discipline = 0
    discipline_open_list: list[list[str]] = []
    try:
        discipline = rest_get(
            base_url,
            service_key,
            "discipline_reports",
            {
                "select": (
                    "id,employee_id,report_status,status,discipline_level,"
                    "incident_date,issue_type"
                )
            },
        )
        for row in discipline:
            if not discipline_is_open(row):
                continue
            open_discipline += 1
            emp = employee_by_id.get(str(row.get("employee_id") or ""), {})
            discipline_open_list.append(
                [
                    employee_display_name(emp) if emp else str(row.get("employee_id") or "—"),
                    str(row.get("issue_type") or "—"),
                    str(row.get("discipline_level") or row.get("report_status") or "—"),
                    fmt_date(row.get("incident_date")),
                ]
            )
        discipline_open_list.sort(key=lambda item: item[0].lower())
    except RuntimeError as err:
        eprint(f"[warn] discipline_reports: {err}")

    open_operations = 0
    operations_open_list: list[list[str]] = []
    try:
        operations = rest_get(
            base_url,
            service_key,
            "operations_issues",
            {"select": "id,title,status,category,created_at,priority"},
        )
        for row in operations:
            if not operations_is_open(row):
                continue
            open_operations += 1
            operations_open_list.append(
                [
                    str(row.get("title") or "—").strip() or "—",
                    str(row.get("category") or "—"),
                    str(row.get("priority") or "—"),
                    str(row.get("status") or "—"),
                    fmt_date(row.get("created_at")),
                ]
            )
        operations_open_list.sort(key=lambda item: item[0].lower())
    except RuntimeError as err:
        eprint(f"[warn] operations_issues: {err}")

    active_candidates = 0
    try:
        candidates = rest_get(
            base_url,
            service_key,
            "candidates",
            {"select": "id,stage,first_name,last_name,position"},
        )
        active_candidates = sum(
            1
            for row in candidates
            if str(row.get("stage") or "").strip().lower() not in ("hired", "rejected", "withdrawn")
        )
    except RuntimeError as err:
        eprint(f"[warn] candidates: {err}")

    terminated_count = sum(1 for row in employees if is_completed_termination(row))
    total_workforce = len(active) + terminated_count
    turnover_rate = (
        f"{(terminated_count / total_workforce * 100):.1f}%"
        if total_workforce
        else "0.0%"
    )

    return {
        "report_date": today.isoformat(),
        "active_headcount": len(active),
        "total_employees": len(employees),
        "department_count": len(departments),
        "on_leave": on_leave,
        "at_risk_count": len(at_risk_active),
        "turnover_ytd": turnover_ytd_percent(employees, len(active), today.year),
        "turnover_rate": turnover_rate,
        "terminated_tracking": terminated_count,
        "new_hires_0_90": len(new_hires_list),
        "active_candidates": active_candidates,
        "stay_interviews_due": len(stay_due_list),
        "open_investigations": open_investigations,
        "high_severity_investigations": high_severity_investigations,
        "investigations_overdue": investigations_overdue,
        "open_discipline": open_discipline,
        "open_operations": open_operations,
        "all_departments": all_departments,
        "stay_due_list": stay_due_list[:25],
        "at_risk_list": at_risk_list[:25],
        "new_hires_list": new_hires_list[:25],
        "terminated_list": terminated_tracking,
        "investigations_open_list": investigations_open_list[:20],
        "discipline_open_list": discipline_open_list[:20],
        "operations_open_list": operations_open_list[:20],
    }


def render_metric_rows(pairs: list[tuple[str, Any]]) -> str:
    rows: list[str] = []
    for index, (label, value) in enumerate(pairs):
        bg = ' style="background: #f6f8fa;"' if index % 2 == 0 else ""
        rows.append(
            f"<tr{bg}><td>{escape(label)}</td>"
            f'<td style="text-align:right">{escape(str(value))}</td></tr>'
        )
    return "\n    ".join(rows)


def render_detail_table(
    title: str,
    headers: list[str],
    rows: list[list[str]],
    *,
    empty_message: str = "None",
) -> str:
    if not rows:
        return (
            f'  <h3 style="margin: 28px 0 10px;">{escape(title)}</h3>\n'
            f'  <p style="margin: 0; color: #64748b;">{escape(empty_message)}</p>\n'
        )

    head = "".join(f"<th>{escape(h)}</th>" for h in headers)
    body_rows: list[str] = []
    for index, row in enumerate(rows):
        bg = ' style="background: #f6f8fa;"' if index % 2 == 0 else ""
        cells = "".join(f"<td>{escape(str(cell))}</td>" for cell in row)
        body_rows.append(f"<tr{bg}>{cells}</tr>")

    return f"""\
  <h3 style="margin: 28px 0 10px;">{escape(title)}</h3>
  <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 720px; border: 1px solid #e2e8f0;">
    <thead>
      <tr style="background: #eef1f4; text-align: left;">{head}</tr>
    </thead>
    <tbody>
      {"".join(body_rows)}
    </tbody>
  </table>
"""


def build_html(metrics: dict[str, Any]) -> str:
    app_url = os.environ.get("ORBIS_APP_URL", "").strip()
    report_date = escape(str(metrics.get("report_date") or ""))

    summary_pairs = [
        ("Active headcount", metrics.get("active_headcount", 0)),
        ("Departments (active)", metrics.get("department_count", 0)),
        ("On leave", metrics.get("on_leave", 0)),
        ("At-risk employees (flagged)", metrics.get("at_risk_count", 0)),
        ("New hires (0–90 days)", metrics.get("new_hires_0_90", 0)),
        ("Active candidates (pipeline)", metrics.get("active_candidates", 0)),
        ("Stay interviews due (today or earlier)", metrics.get("stay_interviews_due", 0)),
        ("Open investigations", metrics.get("open_investigations", 0)),
        ("Investigations overdue", metrics.get("investigations_overdue", 0)),
        ("High / critical investigations", metrics.get("high_severity_investigations", 0)),
        ("Open discipline cases", metrics.get("open_discipline", 0)),
        ("Open operations issues", metrics.get("open_operations", 0)),
        ("Turnover YTD", metrics.get("turnover_ytd", "0%")),
        (
            "Turnover rate (active + terminated tracked)",
            f'{metrics.get("turnover_rate", "0.0%")} ({metrics.get("terminated_tracking", 0)} terminated)',
        ),
    ]

    dept_rows = "".join(
        f"<tr><td>{escape(name)}</td><td style=\"text-align:right\">{count}</td></tr>"
        for name, count in metrics.get("all_departments") or []
    )
    if not dept_rows:
        dept_rows = '<tr><td colspan="2">No department data</td></tr>'

    detail_sections = "".join(
        [
            render_detail_table(
                "Stay interviews due — who",
                ["Employee", "Department", "Due date"],
                metrics.get("stay_due_list") or [],
                empty_message="No stay interviews overdue.",
            ),
            render_detail_table(
                "At-risk employees",
                ["Employee", "Department"],
                metrics.get("at_risk_list") or [],
                empty_message="No employees flagged at-risk.",
            ),
            render_detail_table(
                "New hires (first 90 days)",
                ["Employee", "Department", "Tenure", "Hire date"],
                metrics.get("new_hires_list") or [],
                empty_message="No active employees in their first 90 days.",
            ),
            render_detail_table(
                "Open investigations",
                ["Case #", "Title", "Status", "Severity", "Target completion"],
                metrics.get("investigations_open_list") or [],
                empty_message="No open investigations.",
            ),
            render_detail_table(
                "Open discipline cases",
                ["Employee", "Issue type", "Level / status", "Incident date"],
                metrics.get("discipline_open_list") or [],
                empty_message="No open discipline cases.",
            ),
            render_detail_table(
                "Open operations issues",
                ["Title", "Category", "Priority", "Status", "Opened"],
                metrics.get("operations_open_list") or [],
                empty_message="No open operations issues.",
            ),
            render_detail_table(
                "Recent terminations (tracked)",
                ["Employee", "Termination date"],
                metrics.get("terminated_list") or [],
                empty_message="No terminated employees in tracking roster.",
            ),
        ]
    )

    footer_link = (
        f'<p style="margin-top:20px"><a href="{escape(app_url)}">Open Orbis</a></p>'
        if app_url
        else ""
    )

    return f"""\
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #102a43; line-height: 1.5;">
  <h2 style="margin: 0 0 8px;">Orbis Weekly HR Snapshot</h2>
  <p style="margin: 0 0 20px; color: #64748b;">Report date: {report_date}</p>

  <h3 style="margin: 0 0 10px;">Summary</h3>
  <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 520px;">
    {render_metric_rows(summary_pairs)}
  </table>

  <h3 style="margin: 28px 0 10px;">Headcount by department (active)</h3>
  <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 520px; border: 1px solid #e2e8f0;">
    <thead>
      <tr style="background: #eef1f4; text-align: left;">
        <th>Department</th>
        <th style="text-align:right">Count</th>
      </tr>
    </thead>
    <tbody>
      {dept_rows}
    </tbody>
  </table>

{detail_sections}
  <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
    Generated automatically from Orbis / Supabase. Totals may differ slightly from the live dashboard filters.
  </p>
  {footer_link}
</body>
</html>
"""


def save_report_html(html_body: str, report_date: str) -> str:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(script_dir, "output")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"orbis_weekly_report_{report_date}.html")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(html_body)
    return path


def send_email(subject: str, html_body: str, mail_to: list[str]) -> None:
    smtp_host = env_required("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = env_required("SMTP_USER")
    smtp_pass = env_required("SMTP_PASS")
    mail_from = os.environ.get("MAIL_FROM", smtp_user).strip() or smtp_user

    msg = MIMEMultipart()
    msg["From"] = mail_from
    msg["To"] = ", ".join(mail_to)
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=60) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(mail_from, mail_to, msg.as_string())
    except smtplib.SMTPAuthenticationError as err:
        detail = str(err).lower()
        if "smtpclientauthentication is disabled" in detail or "smtp_auth_disabled" in detail:
            raise RuntimeError("M365_SMTP_DISABLED") from err
        raise RuntimeError(f"SMTP login failed for {smtp_user}: {err}") from err


def main() -> None:
    bootstrap_config()

    parser = argparse.ArgumentParser(description="Email weekly Orbis HR snapshot")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print metrics and HTML to stdout; do not send email",
    )
    parser.add_argument(
        "--save-html",
        action="store_true",
        help="Save report HTML to scripts/output/ (no email)",
    )
    args = parser.parse_args()

    base_url = resolve_supabase_url()
    service_key = env_required("SUPABASE_SERVICE_ROLE_KEY")
    if "paste" in service_key.lower() or len(service_key) < 32:
        die(
            "SUPABASE_SERVICE_ROLE_KEY in scripts/.env.weekly_report is missing or still a placeholder. "
            "Save the file (Cmd+S), paste the full Secret key from Supabase → Settings → API Keys "
            "(service_role / sb_secret_…, not Publishable)."
        )
    if service_key.startswith("sb_publishable"):
        die("You pasted the Publishable key. Use the Secret / service_role key instead.")

    mail_to_raw = os.environ.get("MAIL_TO", DEFAULT_MAIL_TO).strip() or DEFAULT_MAIL_TO
    mail_to = [part.strip() for part in mail_to_raw.split(",") if part.strip()]

    metrics = collect_metrics(base_url, service_key)
    html = build_html(metrics)
    subject = f"Orbis Weekly HR Snapshot — {metrics['report_date']}"

    if args.dry_run:
        print(json.dumps(metrics, indent=2))
        print("\n--- HTML ---\n")
        print(html)
        print(f"\nWould send to: {', '.join(mail_to)}")
        return

    if args.save_html:
        path = save_report_html(html, metrics["report_date"])
        print(f"Saved report: {path}")
        print("Open in a browser → File → Share → Email in Outlook.")
        return

    smtp_pass = os.environ.get("SMTP_PASS", "").strip()
    if not os.environ.get("SMTP_HOST"):
        die("Set SMTP_HOST, SMTP_USER, and SMTP_PASS to send mail (or use --dry-run).")
    if not smtp_pass or smtp_pass.lower() in ("your-app-password-or-smtp-secret", "paste-here"):
        die(
            "Set SMTP_PASS in scripts/.env.weekly_report or ORBIS_WEEKLY_CONFIG "
            "(Google app password for matthew.zinni@btwglobal.com — see myaccount.google.com/apppasswords)."
        )

    try:
        send_email(subject, html, mail_to)
        print(f"Sent weekly report to {', '.join(mail_to)}")
    except RuntimeError as err:
        if str(err) != "M365_SMTP_DISABLED":
            die(str(err))
        path = save_report_html(html, metrics["report_date"])
        eprint(
            "Microsoft 365 blocked SMTP (Authenticated SMTP is off for your mailbox).\n"
            "Report saved so you can send it manually:\n"
            f"  {path}\n"
            "IT fix: M365 admin → Users → matthew.zinni@btwglobal.com → Mail → "
            "Manage email apps → enable Authenticated SMTP.\n"
            "Or run with --save-html each week until SMTP works.\n"
            "See https://aka.ms/smtp_auth_disabled"
        )
        sys.exit(0)


if __name__ == "__main__":
    main()
