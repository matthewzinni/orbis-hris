#!/usr/bin/env python3
"""
Monday email to leadership: who is off this week, pulled from QuickBooks Time (TSheets).

Employees request time off in TSheets. This script reads this week's (Monday-Sunday)
time off request entries from the QuickBooks Time API and emails leadership:
  - Approved time off this week
  - Requests still pending approval

Recipients: the Orbis leadership list (same as time-off alerts), every approved Orbis
admin in user_access, plus TIME_OFF_EXTRA_EMAILS. Override everything with TIME_OFF_MAIL_TO.

Environment (reuses the weekly HR report secrets):
  QBT_ACCESS_TOKEN                     QuickBooks Time API access token (never commit)
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   read Orbis admins from user_access
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
  TIME_OFF_EXTRA_EMAILS   optional, comma-separated extra recipients
  TIME_OFF_MAIL_TO        optional, replaces the recipient list entirely
  TIME_OFF_SEND_HOUR_ET   optional, default 7 (see --scheduled)

Usage:
  python3 scripts/weekly_time_off_email.py --dry-run           # print, do not send
  python3 scripts/weekly_time_off_email.py --week-of 2026-11-02
  python3 scripts/weekly_time_off_email.py                     # send now
  python3 scripts/weekly_time_off_email.py --scheduled          # used by GitHub Actions
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from weekly_orbis_report_email import (  # noqa: E402
    _orbis_letterhead_html,
    bootstrap_config,
    die,
    eprint,
    env_required,
    resolve_supabase_url,
    rest_get,
    send_email_with_retries,
)

ET = ZoneInfo("America/New_York")
QBT_API = "https://rest.tsheets.com/api/v1"

# Same leadership list Orbis uses for time-off alerts (notify-leave-request).
LEADERSHIP_EMAILS = [
    "matthew.zinni@btwglobal.com",
    "trent.wynne@btwglobal.com",
    "brent.wynne@btwglobal.com",
]


# ---------------------------------------------------------------------------
# QuickBooks Time
# ---------------------------------------------------------------------------


def qbt_get(path: str, params: dict[str, str]) -> dict[str, Any]:
    token = env_required("QBT_ACCESS_TOKEN")
    url = f"{QBT_API}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:300]
        if err.code == 401:
            raise RuntimeError(
                "QuickBooks Time rejected QBT_ACCESS_TOKEN (HTTP 401). Create a new token in "
                "QuickBooks Time → Feature Add-ons → API → Add token, then update the secret."
            ) from err
        if err.code == 417:
            # QuickBooks Time returns 417 when a filter matches nothing.
            return {"results": {}, "more": False, "supplemental_data": {}}
        raise RuntimeError(f"QuickBooks Time HTTP {err.code} on {path}: {detail}") from err


def fetch_entries(params: dict[str, str]) -> tuple[dict[str, dict], dict[str, dict], dict[str, dict]]:
    """Return (entries, users, jobcodes) for all pages of a time_off_request_entries query."""
    entries: dict[str, dict] = {}
    users: dict[str, dict] = {}
    jobcodes: dict[str, dict] = {}
    page = 1
    while True:
        body = qbt_get(
            "time_off_request_entries",
            {**params, "supplemental_data": "yes", "limit": "200", "page": str(page)},
        )
        entries.update((body.get("results") or {}).get("time_off_request_entries") or {})
        supp = body.get("supplemental_data") or {}
        users.update(supp.get("users") or {})
        jobcodes.update(supp.get("jobcodes") or {})
        if not body.get("more") or page >= 50:
            break
        page += 1
    return entries, users, jobcodes


def entry_date(entry: dict[str, Any]) -> date | None:
    raw = str(entry.get("date") or entry.get("start_time") or "")[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def collect_week(monday: date) -> dict[str, Any]:
    sunday = monday + timedelta(days=6)
    entries: dict[str, dict] = {}
    users: dict[str, dict] = {}
    jobcodes: dict[str, dict] = {}

    # All-day ("manual") entries carry a date; partial-day ("regular") entries carry start/end
    # times. Query both ways and de-duplicate by entry id.
    for offset in range(7):
        day = monday + timedelta(days=offset)
        e, u, j = fetch_entries({"date": day.isoformat()})
        entries.update(e)
        users.update(u)
        jobcodes.update(j)

    start = datetime.combine(monday, datetime.min.time(), tzinfo=ET)
    end = datetime.combine(sunday, datetime.max.time().replace(microsecond=0), tzinfo=ET)
    e, u, j = fetch_entries({"start_time": start.isoformat(), "end_time": end.isoformat()})
    entries.update(e)
    users.update(u)
    jobcodes.update(j)

    # Group entries per person + status.
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in entries.values():
        status = str(entry.get("status") or "").lower()
        if status not in ("approved", "pending"):
            continue
        if entry.get("active") is False:
            continue
        day = entry_date(entry)
        if not day or day < monday or day > sunday:
            continue

        user = users.get(str(entry.get("user_id"))) or {}
        name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or f"User {entry.get('user_id')}"
        jobcode = jobcodes.get(str(entry.get("jobcode_id"))) or {}
        kind = str(jobcode.get("name") or "Time off").strip()
        hours = float(entry.get("duration") or 0) / 3600.0

        key = (name, status)
        row = grouped.setdefault(key, {"name": name, "status": status, "days": {}, "types": set()})
        row["days"][day] = row["days"].get(day, 0.0) + hours
        row["types"].add(kind)

    rows = sorted(grouped.values(), key=lambda r: (min(r["days"]), r["name"].lower()))
    return {
        "monday": monday,
        "sunday": sunday,
        "approved": [r for r in rows if r["status"] == "approved"],
        "pending": [r for r in rows if r["status"] == "pending"],
    }


# ---------------------------------------------------------------------------
# Recipients
# ---------------------------------------------------------------------------


def split_emails(raw: str) -> list[str]:
    return [p.strip().lower() for p in raw.replace(";", ",").replace(" ", ",").split(",") if p.strip()]


def resolve_recipients() -> list[str]:
    override = os.environ.get("TIME_OFF_MAIL_TO", "").strip()
    if override:
        return split_emails(override)

    recipients: list[str] = list(LEADERSHIP_EMAILS)
    try:
        admins = rest_get(
            resolve_supabase_url(),
            env_required("SUPABASE_SERVICE_ROLE_KEY"),
            "user_access",
            {"select": "email", "role": "eq.admin", "approval_status": "eq.approved"},
        )
        recipients += [str(a.get("email") or "").strip().lower() for a in admins]
    except RuntimeError as err:
        eprint(f"Could not load Orbis admins, sending to leadership list only: {err}")

    recipients += split_emails(os.environ.get("TIME_OFF_EXTRA_EMAILS", ""))
    seen: list[str] = []
    for email in recipients:
        if email and email not in seen:
            seen.append(email)
    return seen


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------


def fmt_day(day: date) -> str:
    return f"{day:%a} {day.month}/{day.day}"


def fmt_hours(hours: float) -> str:
    return "All day" if hours <= 0 else f"{hours:g} hrs"


def render_rows(rows: list[dict[str, Any]], empty_text: str) -> str:
    if not rows:
        return f'<p style="color:#64748b;font-size:14px;margin:6px 0 18px;">{escape(empty_text)}</p>'
    body = []
    for row in rows:
        days = sorted(row["days"].items())
        when = "<br>".join(f"{escape(fmt_day(d))} &middot; {escape(fmt_hours(h))}" for d, h in days)
        total = sum(h for _, h in days)
        body.append(
            "<tr>"
            f'<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;">{escape(row["name"])}</td>'
            f'<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{when}</td>'
            f'<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{escape(", ".join(sorted(row["types"])))}</td>'
            f'<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">{total:g}</td>'
            "</tr>"
        )
    head = (
        '<tr style="background:#f1f5f9;text-align:left;">'
        '<th style="padding:8px 10px;">Employee</th><th style="padding:8px 10px;">Days</th>'
        '<th style="padding:8px 10px;">Type</th><th style="padding:8px 10px;text-align:right;">Total hrs</th></tr>'
    )
    return (
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 22px;">'
        f"{head}{''.join(body)}</table>"
    )


def build_html(week: dict[str, Any]) -> str:
    monday, sunday = week["monday"], week["sunday"]
    span = f"{monday:%B} {monday.day} – {sunday:%B} {sunday.day}, {sunday.year}"
    approved, pending = week["approved"], week["pending"]
    summary = (
        f"{len(approved)} {'person' if len(approved) == 1 else 'people'} with approved time off"
        f" · {len(pending)} pending {'request' if len(pending) == 1 else 'requests'}"
    )
    return f"""\
<html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:760px;margin:0 auto;padding:24px;">
{_orbis_letterhead_html("Time Off This Week", escape(span))}
  <p style="font-size:15px;margin:0 0 18px;">{escape(summary)}. Source: QuickBooks Time (TSheets).</p>
  <h2 style="font-size:16px;margin:0;">Approved time off</h2>
  {render_rows(approved, "No approved time off this week.")}
  <h2 style="font-size:16px;margin:0;">Pending approval</h2>
  {render_rows(pending, "No pending requests for this week.")}
  <p style="font-size:12px;color:#64748b;margin-top:24px;">
    Approve or deny pending requests in QuickBooks Time. Sent automatically every Monday by Orbis.
  </p>
</body></html>"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def scheduled_run_should_send() -> bool:
    """GitHub cron is UTC. The workflow fires at two UTC hours so one of them is 7 AM Eastern
    in both daylight and standard time; only that run sends."""
    cron = os.environ.get("CRON_SCHEDULE", "").strip()
    target = int(os.environ.get("TIME_OFF_SEND_HOUR_ET", "7"))
    if not cron:
        return True
    try:
        utc_hour = int(cron.split()[1])
    except (IndexError, ValueError):
        return True
    today_utc = datetime.now(timezone.utc).date()
    slot = datetime(today_utc.year, today_utc.month, today_utc.day, utc_hour, tzinfo=timezone.utc)
    return slot.astimezone(ET).hour == target


def main() -> None:
    bootstrap_config()
    parser = argparse.ArgumentParser(description="Email leadership this week's time off from QuickBooks Time")
    parser.add_argument("--dry-run", action="store_true", help="Print the email; do not send")
    parser.add_argument("--week-of", help="Any date in the week to report (YYYY-MM-DD). Default: this week")
    parser.add_argument("--scheduled", action="store_true", help="Skip unless this cron slot is 7 AM Eastern")
    args = parser.parse_args()

    if args.scheduled and not scheduled_run_should_send():
        print("Not the 7 AM Eastern slot for today's time zone offset; skipping.")
        return

    ref = date.fromisoformat(args.week_of) if args.week_of else datetime.now(ET).date()
    monday = ref - timedelta(days=ref.weekday())

    week = collect_week(monday)
    html = build_html(week)
    subject = f"Time off this week — {monday:%b} {monday.day}"
    recipients = resolve_recipients()

    if args.dry_run:
        print(html)
        print(f"\nWould send to: {', '.join(recipients)}")
        return

    if not recipients:
        die("No recipients resolved.")
    send_email_with_retries(subject, html, recipients)
    print(f"Sent '{subject}' to {', '.join(recipients)}")


if __name__ == "__main__":
    main()
