#!/usr/bin/env python3
"""One-off: parse Stay_Interview_*.docx → scripts/data/stay_interviews_import.csv"""

from __future__ import annotations

import csv
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

DOCX_DIR = Path("/Users/matthewzinni/Desktop/Work/Stay Interviews")
LOOKUP_CSV = Path(__file__).resolve().parents[1] / "tools" / "employee_lookup.csv"
OUT_CSV = Path(__file__).resolve().parent / "data" / "stay_interviews_import.csv"

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

TYPE_MAP = {
    "6 month": "6-Month",
    "1 year": "Annual",
    "90 days": "90-Day",
    "90 day": "90-Day",
    "3 month": "Other",
}


def docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    out: list[str] = []
    for p in root.iter(f"{W}p"):
        texts = [t.text for t in p.iter(f"{W}t") if t.text]
        if texts:
            out.append("".join(texts))
    return out


def parse_date(raw: str) -> str:
    raw = raw.strip()
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"bad date {raw!r}")


def interview_type_from_title(title: str) -> str:
    t = title.lower()
    for key, val in TYPE_MAP.items():
        if key in t:
            return val
    return "Stay Interview"


def extract_qa(paras: list[str]) -> tuple[dict[str, str], list[tuple[str, str]], str]:
    meta: dict[str, str] = {}
    title = paras[0] if paras else ""
    for p in paras[:12]:
        if m := re.match(r"Employee Name:\s*(.+)", p, re.I):
            meta["name"] = m.group(1).strip()
        elif m := re.match(r"Interview Date:\s*(.+)", p, re.I):
            meta["date"] = parse_date(m.group(1).strip())
        elif m := re.match(r"Interviewer:\s*(.+)", p, re.I):
            meta["interviewer"] = m.group(1).strip()

    qa: list[tuple[str, str]] = []
    i = 0
    while i < len(paras):
        line = paras[i].strip()
        if "?" in line and not line.lower().startswith("hr summary"):
            q = re.sub(r"^\d+\.\s*", "", line).strip()
            answers: list[str] = []
            j = i + 1
            while j < len(paras):
                nxt = paras[j].strip()
                if not nxt:
                    j += 1
                    continue
                if nxt.lower().startswith("hr summary"):
                    break
                if "?" in nxt and re.match(r"^(\d+\.|[A-Z])", nxt[:3] if len(nxt) >= 3 else nxt):
                    # next numbered question or section
                    if "?" in nxt:
                        break
                if re.match(r"^\d+\.\s+[A-Z]", nxt) and "?" not in nxt:
                    j += 1
                    continue
                if "?" in nxt:
                    break
                answers.append(nxt)
                j += 1
            ans = " ".join(answers).strip()
            if ans:
                qa.append((q, ans))
            i = j
            continue
        i += 1

    hr = ""
    for idx, p in enumerate(paras):
        if p.strip().lower().startswith("hr summary"):
            hr = "\n".join(paras[idx:]).strip()
            break

    meta["interview_type"] = interview_type_from_title(title)
    return meta, qa, hr


def map_to_orbis_qa(qa: list[tuple[str, str]]) -> dict[str, str]:
    """Map docx Q&A order to Orbis q1–q7 (first seven answers; bundle extras into q7)."""
    answers = [a for _, a in qa]
    while len(answers) < 7:
        answers.append("")
    if len(answers) > 7:
        extra = " | ".join(answers[6:])
        answers[6] = (answers[6] + " | " + " | ".join(answers[7:])).strip(" |")
        answers = answers[:7]
    keys = [f"q{i}" for i in range(1, 8)]
    return dict(zip(keys, answers))


def load_name_to_id() -> dict[str, str]:
    lookup: dict[str, str] = {}
    with LOOKUP_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            eid = row["employee_id"].strip()
            fn = row["first_name"].strip().lower()
            ln = row["last_name"].strip().lower()
            lookup[f"{fn} {ln}"] = eid
            lookup[f"{fn} {ln.replace('-', ' ')}"] = eid
    return lookup


def resolve_employee_id(meta_name: str, filename: str, lookup: dict[str, str]) -> str:
    name = meta_name.strip()
    key = name.lower()
    if key in lookup:
        return lookup[key]
    # try without middle names / hyphen variants
    parts = name.split()
    if len(parts) >= 2:
        short = f"{parts[0].lower()} {parts[-1].lower()}"
        if short in lookup:
            return lookup[short]
    stem = filename.replace("Stay_Interview_", "").replace(".docx", "")
    for k, v in lookup.items():
        if k.startswith(stem.lower()):
            return v
    raise KeyError(f"No employee_id for {name!r} ({filename})")


def csv_cell(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")


def main() -> None:
    lookup = load_name_to_id()
    rows_out: list[dict[str, str]] = []

    for path in sorted(DOCX_DIR.glob("Stay_Interview_*.docx")):
        paras = docx_paragraphs(path)
        meta, qa, hr = extract_qa(paras)
        emp_id = resolve_employee_id(meta.get("name", ""), path.name, lookup)
        fields = map_to_orbis_qa(qa)
        rows_out.append(
            {
                "employee_id": emp_id,
                "interview_date": meta["date"],
                "interview_type": meta["interview_type"],
                **fields,
                "manager_summary": hr,
            }
        )

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    headers = [
        "employee_id",
        "interview_date",
        "interview_type",
        "q1",
        "q2",
        "q3",
        "q4",
        "q5",
        "q6",
        "q7",
        "manager_summary",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for row in rows_out:
            w.writerow({k: csv_cell(row.get(k, "")) for k in headers})

    print(f"Wrote {len(rows_out)} rows to {OUT_CSV}")


if __name__ == "__main__":
    main()
