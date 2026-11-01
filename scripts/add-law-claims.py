#!/usr/bin/env python3
"""add-law-claims.py — 법령 조문 원문 claim 생성 정본(설계: docs/law-stage3-design.md §4).

입력: data/ontology/law-selection.json(마스터 확정 80건) + ~/2nd/.ua/laws-text/<법령>/<MST>-<sha>.json(fetch-law-text.py 보존본, 법령별 최신 MST)
출력: data/ontology/law-claims.json — 조문 1건 = 항목 1개. 원문만 담는다(요약·해석 없음, D2).
검증(기계, §4.4): ① 선정한 조문이 보존본에 정확히 1건씩 있고 삭제 조문이 아님 ② 렌더 텍스트 == 원문 노드의 문자열 잎 전체(공백 정규화, 렌더러와 다른 일반 순회로 대조)
              ③ 시행일 해석 가능 ④ 조문번호 연속성(선정 조문이 속한 법령의 번호 진행이 비정상이면 경고)
사용:  python3 scripts/add-law-claims.py            # 검증만(쓰지 않음)
       python3 scripts/add-law-claims.py --apply    # law-claims.json 갱신(멱등: 입력이 같으면 파일 불변, fetched_at 은 보존본 변경 시에만 갱신)
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
OD = os.path.join(HERE, "..", "data", "ontology")
SELECTION = os.path.join(OD, "law-selection.json")
OUT = os.path.join(OD, "law-claims.json")
STORE = os.path.join(os.path.expanduser("~"), "2nd", ".ua", "laws-text")
META_KEYS = {"조문번호", "조문가지번호", "조문여부", "조문제목", "조문시행일자", "조문변경여부", "조문이동이전", "조문이동이후", "조문키", "조문참고자료", "항번호", "호번호", "호가지번호", "목번호",
             "항제개정유형", "항제개정일자문자열", "호제개정유형", "호제개정일자문자열", "목제개정유형", "목제개정일자문자열"}  # 제개정 계열은 본문의 <개정 …> 주석과 같은 정보를 따로 담은 메타


def as_list(x):
    return x if isinstance(x, list) else ([] if x in (None, "") else [x])


def s(x):
    return "\n".join(s(i) for i in x) if isinstance(x, list) else (x or "")


def render(a):
    """조문 단위 → 사람이 읽는 원문(개정 주석 포함). 조 머리 → 항 → 호 → 목 순서, 호·목은 들여쓰기."""
    out = [s(a.get("조문내용")).strip()]
    for h in as_list(a.get("항")):
        out.append(s(h.get("항내용")).strip())
        for ho in as_list(h.get("호")):
            out.append("  " + s(ho.get("호내용")).strip())
            for m in as_list(ho.get("목")):
                out.append("    " + s(m.get("목내용")).strip())
    return "\n".join(x for x in out if x.strip())


def leaves(node):
    """렌더러와 독립된 대조용: 노드 아래의 모든 문자열 잎(메타 키 제외)을 자기 본문 → 하위 구조 순서로."""
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for i in node:
            yield from leaves(i)
    elif isinstance(node, dict):
        # 보존본은 sort_keys 로 저장되어 키 순서가 가나다순이다 → 순서를 키 이름이 아닌 일반 규칙으로 정한다: '…내용' 키(자기 본문)를 먼저, 하위 구조(항·호·목)는 그 뒤에
        items = [(k, v) for k, v in node.items() if k not in META_KEYS]
        for k, v in [i for i in items if i[0].endswith("내용")] + [i for i in items if not i[0].endswith("내용")]:
            yield from leaves(v)


def norm(t):
    return re.sub(r"\s+", "", t)


def key_of(a):
    return f"제{a['조문번호']}조" + (f"의{a['조문가지번호']}" if a.get("조문가지번호") else "")


def iso(d8):
    d8 = str(d8 or "").strip()
    try:
        return date(int(d8[:4]), int(d8[4:6]), int(d8[6:8])).isoformat() if len(d8) == 8 else None
    except ValueError:
        return None


def latest_file(law_dir):
    """법령 폴더의 보존본 중 MST(숫자) 가장 큰 것. 같은 MST 가 여러 해시이면 파일명 사전순 마지막."""
    files = [f for f in os.listdir(law_dir) if re.match(r"^\d+-[0-9a-f]{12}\.json$", f)]
    return max(files, key=lambda f: (int(f.split("-")[0]), f)) if files else None


def partial_dates(base, art_no, branch):
    """기본정보.조문시행일자문자열("20260709:제26조제1항제30호, …") 중 해당 조문에 걸린 후속 시행일(대표와 다른 것)."""
    rep = str(base.get("시행일자") or "")
    pat = re.compile(r"(\d{8})\s*:\s*제(\d+)조(?:의(\d+))?")
    return sorted({iso(d) for d, n, b in pat.findall(str(base.get("조문시행일자문자열") or "")) if n == art_no and (b or "") == (branch or "") and d != rep and iso(d)})


def law_url(name, key):
    return "https://www.law.go.kr/법령/" + name.replace(" ", "") + "/" + key  # 법제처 공개 URL 은 법령명의 공백을 뺀 형식


def build(selection, store, today=None):
    claims, problems, warns = [], [], []
    by_law = {}
    for e in selection["articles"]:
        by_law.setdefault(e["law"], []).append(e)
    slug = lambda lid: lid.split(":", 1)[1]
    for lid, entries in by_law.items():
        d = os.path.join(store, lid.replace(":", "_"))
        f = latest_file(d) if os.path.isdir(d) else None
        if not f:
            problems.append(f"{lid}: 보존본 없음 — fetch-law-text.py 를 먼저 실행")
            continue
        with open(os.path.join(d, f), "rb") as fh:
            raw = fh.read()
        sha = hashlib.sha256(raw).hexdigest()
        body = json.loads(raw)["법령"]
        base = body["기본정보"]
        name = base["법령명_한글"]
        mst = f.split("-")[0]
        eff = iso(base.get("시행일자"))
        if not eff:
            problems.append(f"{name}: 대표 시행일 해석 불가({base.get('시행일자')!r})")
            continue
        units = [a for a in as_list(body["조문"]["조문단위"]) if a.get("조문여부") == "조문"]
        index = {}
        for a in units:
            index.setdefault(key_of(a), []).append(a)
        nums = [int(a["조문번호"]) for a in units]
        if any(b < a for a, b in zip(nums, nums[1:])):
            warns.append(f"{name}: 조문번호가 단조 증가가 아님(조문 이동·재배열 가능)")
        for e in entries:
            hit = index.get(e["article"], [])
            if len(hit) != 1:
                problems.append(f"{name} {e['article']}: 보존본에서 {len(hit)}건(정확히 1건이어야 함)")
                continue
            a = hit[0]
            text = render(a)
            if not text.strip() or text.strip().endswith("삭제"):
                problems.append(f"{name} {e['article']}: 삭제 조문이거나 본문 없음")
                continue
            if norm(text) != norm("".join(leaves({k: v for k, v in a.items() if k != "조문제목"}))):
                problems.append(f"{name} {e['article']}: 렌더 텍스트가 원문 노드와 다름(파서 오류)")
                continue
            title = s(a.get("조문제목")).strip()
            if title and title != e.get("title") and e.get("title"):
                warns.append(f"{name} {e['article']}: 선정 목록 제목({e.get('title')!r}) ≠ 원문 제목({title!r})")
            art_eff = iso(a.get("조문시행일자")) or eff
            claims.append({
                "id": f"LAW-{slug(lid)}-{a['조문번호']}" + (f"-{a['조문가지번호']}" if a.get("조문가지번호") else ""),
                "law_id": lid, "law_name": name, "mst": mst, "article": e["article"], "title": title,
                "text": text, "effective": eff, "article_effective": art_eff,
                "partial_effective": partial_dates(base, a["조문번호"], a.get("조문가지번호")),
                "url": law_url(name, e["article"]), "sha256": sha,
            })
    return claims, problems, warns


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--store", default=STORE)
    ap.add_argument("--selection", default=SELECTION)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    with open(a.selection, encoding="utf-8") as fh:
        selection = json.load(fh)
    if selection.get("confirmed") is not True:
        print("law-selection.json confirmed≠true — 중단", file=sys.stderr)
        return 1
    claims, problems, warns = build(selection, a.store)
    for w in warns:
        print("경고:", w)
    if problems:
        for p in problems:
            print("오류:", p, file=sys.stderr)
        return 1
    ids = [c["id"] for c in claims]
    if len(ids) != len(set(ids)):
        print("오류: claim id 중복", file=sys.stderr)
        return 1
    prev = {"claims": []}
    if os.path.exists(a.out):
        with open(a.out, encoding="utf-8") as fh:
            prev = json.load(fh)
    prev_by = {c["id"]: c for c in prev["claims"]}
    for c in claims:  # 보존본(sha)이 같으면 수집일 유지 → 멱등
        p = prev_by.get(c["id"])
        c["fetched_at"] = p["fetched_at"] if p and p["sha256"] == c["sha256"] else date.today().isoformat()
    claims.sort(key=lambda c: c["id"])
    doc = {"version": 1, "note": "원문만 담는다(요약·해석 없음). 정본: scripts/add-law-claims.py. 수정 금지, 재생성하세요.", "claims": claims}
    text = json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    chars = sum(len(c["text"]) for c in claims)
    print(f"검증 통과: 조문 {len(claims)}건 · {chars:,}자 · 법령 {len({c['law_id'] for c in claims})}개 · 부분 시행 표기 {sum(1 for c in claims if c['partial_effective'])}건")
    if not a.apply:
        cur = ""
        if os.path.exists(a.out):
            with open(a.out, encoding="utf-8") as fh:
                cur = fh.read()
        print("현재 파일과 동일" if cur == text else "현재 파일과 다름(--apply 로 갱신)")
        return 0
    with open(a.out, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("기록:", os.path.relpath(a.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
