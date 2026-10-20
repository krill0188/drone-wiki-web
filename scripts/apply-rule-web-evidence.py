#!/usr/bin/env python3
"""웹 조사(에이전트) 결과를 rules.json 의 webEvidence 로 기록한다. 상수는 바꾸지 않는다.
sourceStatus 는 사람이 원문을 직접 확인한 규칙(VERIFIED)만 verified 로 올리고, 나머지는 partially-verified 이하로 둔다.
사용: python3 scripts/apply-rule-web-evidence.py <rule-evidence 디렉터리>"""
import json, re, sys, pathlib
src = pathlib.Path(sys.argv[1]).expanduser()
RULES = pathlib.Path(__file__).resolve().parent.parent / "data/ontology/rules.json"
VERIFIED = {"R02": "arXiv:2607.22768 §IV-A1 'tip-clearance safety factor ε=0.05' 원문 확인(2026-10-20)",
            "R11": "Grepow 'Max Continuous Discharge Current (A)=C-rate×Battery Capacity (Ah)' 원문 확인(2026-10-20)",
            "R16": "Semtech FAQ 'from 250 bps to 11 kbps with LoRa modulation' 원문 확인(2026-10-20)"}
idx = (src / "INDEX.md").read_text(encoding="utf-8")
row = {m.group(1): [c.strip() for c in m.group(0).split("|")[1:-1]] for m in re.finditer(r"^\| (R\d+) .*$", idx, re.M)}
data = json.loads(RULES.read_text(encoding="utf-8"))
rules = data["rules"] if isinstance(data, dict) else data
for r in rules:
    f = src / f"{r['id']}.md"
    if r["id"] not in row or not f.exists(): continue
    strength = row[r["id"]][3].strip("* ").upper()
    match = row[r["id"]][4]
    urls = list(dict.fromkeys(re.findall(r"https?://[^\s)\]>\"']+", f.read_text(encoding="utf-8"))))[:8]
    r["webEvidence"] = {"collected": "2026-10-20", "by": "web-research-agent", "strength": strength, "constantsVsLiterature": match, "urls": urls,
                        "humanVerified": VERIFIED.get(r["id"])}
    if r["id"] in VERIFIED: r["sourceStatus"] = "verified"
    elif strength in ("HIGH", "MEDIUM") and r.get("sourceStatus", "unverified") == "unverified": r["sourceStatus"] = "partially-verified"
    if strength == "LOW" or "불일치" in match:
        r["literatureConflict"] = match  # 상수를 바꾸지 않고 마스터 결정 대상으로 표시
RULES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print({r["id"]: (r.get("sourceStatus"), r.get("webEvidence", {}).get("strength"), bool(r.get("literatureConflict"))) for r in rules if "webEvidence" in r})
