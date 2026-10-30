#!/usr/bin/env python3
"""동향 이벤트 생성 (결정론, AI 없음). 설계: docs/dikw-dynamic-ontology-design.md §5.
입력: ~/2nd/.ua/news-feed.json (--feed), data/ontology/graph.json (제조사·제품 노드)
출력: data/ontology/events.json  {generated, window_days, events:[…], links:[…], stats}

원칙
- 이벤트는 사실이 아니다: status는 항상 'unverified'. graph.json·knowledge.sql에는 넣지 않고 이 파일에만 둔다.
- 제3자 콘텐츠이므로 제목·URL·출처·날짜만 담는다(summary 본문은 버린다).
- 링크는 문자열 규칙으로만 만든다. 애매하면 링크하지 않는다(정밀도 우선).
    1) 제조사 이름·별칭이 제목에 낱말 경계로 정확히 나오면 Manufacturer 링크. 같은 별칭이 제조사 둘 이상이면 링크 안 함.
    2) 제품 모델 토큰(영문+숫자 4자 이상)이 제목에 나오고 카탈로그에서 제품 하나에만 대응하며 그 제품의 제조사도 제목에 있으면 Product 링크.
- 기준 시각은 입력(피드의 가장 늦은 fetched 날짜)에서 정한다 → 같은 입력이면 출력이 바이트 단위로 같다.
- 날짜를 해석할 수 없는 항목은 창에 넣지 않는다(fetched로 대체하면 거짓으로 최신처럼 보이므로).
- 법령 이벤트(제목이 "[법령] {법령명} · …", 2nd/scripts/fetch-law.py 가 만든 것)는 laws.json 의 법령명과 정확히 같을 때만 Law 링크를 만든다.
  개정은 공포 후 시행까지 몇 달이 걸려도 의미가 있으므로 창은 --law-window-days(기본 365)를 쓴다. 제조사·제품 링크는 시도하지 않는다.
실행: python3 -I scripts/build-events.py [--feed PATH] [--out PATH] [--window-days 90]
"""
import argparse, collections, hashlib, json, os, re, sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OD = os.path.join(HERE, "..", "data", "ontology")
# 논문은 canonical 위키가 따로 다루고, 채용 공고는 동향이 아니다.
INCLUDE_TYPES = {"news", "video", "release", "defense", "gov", "regulation"}
MIN_NAME_LEN = 4
# fetch-law.py 와의 계약: "[법령] 항공안전법 · 일부개정 · 시행 2026-04-01"
LAW_TITLE_PREFIX = "[법령] "
LAW_TITLE_SEP = " · "
# 제목에 흔히 나오는 일반 낱말과 겹치는 제조사명은 오링크가 많아 별칭으로 쓰지 않는다.
GENERIC_NAMES = {"drone", "drones", "flight", "power", "motor", "motors", "systems", "technology", "robotics", "aero", "aviation", "labs", "tech"}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def parse_day(s):
    """RFC 2822·ISO 날짜(시각 포함 가능)만 해석한다. '2024'·'2025-1'처럼 불완전하면 None."""
    if not isinstance(s, str) or not s.strip():
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s) if "," in s else datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if not re.match(r"^\d{4}-\d{2}-\d{2}", s) and "," not in s:
        return None  # 연도만·연월만은 날짜가 아니다
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).date()


def aliases(label: str, registry: str | None):
    out = set()
    for raw in [label, registry or ""]:
        base = re.sub(r"\(.*?\)", " ", raw)
        out.add(norm(base))
        for inner in re.findall(r"\((.*?)\)", raw):
            out.add(norm(inner))
        for part in re.split(r"[/,]", base):  # 'Tattu / Gens ace' 같은 병기
            out.add(norm(part))
    return {a for a in out if len(a) >= MIN_NAME_LEN and a not in GENERIC_NAMES}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--feed", default=os.path.expanduser("~/2nd/.ua/news-feed.json"))
    ap.add_argument("--out", default=os.path.join(OD, "events.json"))
    ap.add_argument("--window-days", type=int, default=90)
    ap.add_argument("--law-window-days", type=int, default=365)
    ap.add_argument("--laws", default=os.path.join(OD, "laws.json"))
    a = ap.parse_args()

    feed = json.load(open(a.feed, encoding="utf-8"))
    graph = json.load(open(os.path.join(OD, "graph.json"), encoding="utf-8"))

    # 기준 날짜 = 피드에서 가장 늦은 수집일(입력에서만 결정)
    fetched = [parse_day(i.get("fetched")) for i in feed]
    fetched = [d for d in fetched if d]
    if not fetched:
        sys.exit("피드에 해석 가능한 fetched가 없습니다")
    today = max(fetched)
    floor = today - timedelta(days=a.window_days)
    law_floor = today - timedelta(days=a.law_window_days)
    # 법령명 → 법령 ID. 목록은 사람이 정한 laws.json 한 곳(없으면 법령 링크 없음).
    law_by_name = {}
    if os.path.exists(a.laws):
        law_by_name = {x["name"]: x["id"] for x in json.load(open(a.laws, encoding="utf-8"))["laws"]}

    # 제조사 별칭 → 제조사 ID(둘 이상이면 모호하므로 제외)
    # 별칭이 여러 제조사 노드에 걸릴 때(예: 'DJI'가 DJI·DJI Enterprise·DJI Agriculture에 모두 파생) 노드 자신의 이름과 정확히 같은 노드가 있으면 그쪽이 정본이다.
    alias_owner, exact_owner = collections.defaultdict(set), collections.defaultdict(set)
    for n in graph["nodes"]:
        if n["type"] == "Manufacturer":
            own = norm(re.sub(r"\(.*?\)", " ", n["label"]))
            for al in aliases(n["label"], n.get("registryName")):
                alias_owner[al].add(n["id"])
                if al == own:
                    exact_owner[al].add(n["id"])
    # 3자 대문자 상표(예: DJI)는 길이 하한에 걸리지만 일반 낱말과 겹칠 위험이 작다. 노드 자신의 이름이 정확히 그 3자일 때만, 원문 대소문자까지 맞춰 링크한다.
    short_caps = {}
    for n in graph["nodes"]:
        if n["type"] == "Manufacturer" and re.fullmatch(r"[A-Z0-9]{3}", n["label"]):
            short_caps.setdefault(n["label"], set()).add(n["id"])
    short_caps = {k: next(iter(v)) for k, v in short_caps.items() if len(v) == 1}
    pick = {al: (exact_owner.get(al) or ids) for al, ids in alias_owner.items()}
    mfr_alias = {al: next(iter(ids)) for al, ids in pick.items() if len(ids) == 1}
    ambiguous_aliases = sorted(al for al, ids in pick.items() if len(ids) > 1)

    # 제품 모델 토큰 → 제품 ID(하나에만 대응할 때만) + 그 제품의 제조사
    made_by = {e["s"]: e["o"] for e in graph["edges"] if e["p"] == "madeBy"}
    tok_owner = collections.defaultdict(set)
    for n in graph["nodes"]:
        if n["type"] == "Product":
            for tok in norm(re.sub(r"\(.*?\)", " ", n["label"])).split():
                if len(tok) >= MIN_NAME_LEN and re.search(r"\d", tok) and re.search(r"[a-z]", tok) and not re.fullmatch(r"\d+(gb|mb|mah|kv|mm|in|v|c|s)", tok):
                    tok_owner[tok].add(n["id"])
    prod_tok = {t: next(iter(ids)) for t, ids in tok_owner.items() if len(ids) == 1}

    events, links = [], []
    stats = collections.Counter()
    for it in feed:
        if it.get("type") not in INCLUDE_TYPES:
            stats["제외:유형(paper·job 등)"] += 1
            continue
        is_law = it.get("type") == "regulation" and (it.get("title") or "").startswith(LAW_TITLE_PREFIX)
        day = parse_day(it.get("published"))
        if day is None:
            stats["제외:날짜 해석 불가"] += 1
            continue
        if day < (law_floor if is_law else floor) or day > today:
            stats["제외:창 밖(기간 초과 또는 미래)"] += 1
            continue
        title, url = (it.get("title") or "").strip(), (it.get("url") or "").strip()
        if not title or not url.startswith("http"):
            stats["제외:제목·URL 없음"] += 1
            continue
        eid = "event:" + (it.get("sha256") or hashlib.sha256(url.encode()).hexdigest())[:12]
        events.append({"id": eid, "type": "Event", "eventType": it["type"], "title": title, "url": url,
                       "source": it.get("source") or "", "domain": it.get("domain") or "", "published": day.isoformat(), "status": "unverified"})
        if is_law:  # 법령명이 laws.json 과 정확히 같을 때만 링크. 제조사·제품 매칭은 하지 않는다(법령 제목에 대한 오링크 방지).
            law_id = law_by_name.get(title[len(LAW_TITLE_PREFIX):].split(LAW_TITLE_SEP)[0].strip())
            if law_id:
                links.append({"event": eid, "node": law_id, "nodeType": "Law", "predicate": "mentions", "method": "law-title-exact", "score": 1.0})
            stats["링크됨" if law_id else "미링크"] += 1
            continue
        t = " " + norm(title) + " "
        mfr_hit = sorted({mid for al, mid in mfr_alias.items() if f" {al} " in t} | {mid for name, mid in short_caps.items() if re.search(rf"(?<![A-Za-z0-9]){name}(?![A-Za-z0-9])", title)})
        for mid in mfr_hit:
            links.append({"event": eid, "node": mid, "nodeType": "Manufacturer", "predicate": "mentions", "method": "exact-name", "score": 1.0})
        prod_hit = sorted({pid for tok, pid in prod_tok.items() if f" {tok} " in t and made_by.get(pid) in mfr_hit})
        for pid in prod_hit:
            links.append({"event": eid, "node": pid, "nodeType": "Product", "predicate": "mentions", "method": "model-token+manufacturer", "score": 1.0})
        stats["링크됨" if (mfr_hit or prod_hit) else "미링크"] += 1

    events.sort(key=lambda e: (e["published"], e["id"]), reverse=True)
    links.sort(key=lambda l: (l["event"], l["node"]))
    out = {"generated": today.isoformat(), "window_days": a.window_days, "law_window_days": a.law_window_days, "events": events, "links": links,
           "stats": {"input": len(feed), "events": len(events), "links": len(links), "manufacturerLinks": sum(1 for l in links if l["nodeType"] == "Manufacturer"),
                     "productLinks": sum(1 for l in links if l["nodeType"] == "Product"), "lawLinks": sum(1 for l in links if l["nodeType"] == "Law"), "ambiguousAliasesDropped": len(ambiguous_aliases), **dict(sorted(stats.items()))}}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print(json.dumps(out["stats"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
