#!/usr/bin/env python3
"""HW 수집 제품 문서(핵심 사양 표) → 온톨로지 인스턴스(data/ontology/instances.json).

결정론적 파서(AI 호출 없음). 읽지 못한 값은 만들지 않고 비워 둔다 — 추론 엔진이 '확인 필요'로 취급.
각 속성에 출처 문서와 원문 값을 남겨 추적 가능하게 한다.
사용: python3 scripts/build-hw-instances.py <products 폴더> [출력경로]
"""
import glob, json, os, re, sys

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data", "ontology", "instances.json")

CLASS_OF = {"motor": "Motor", "esc": "ESC", "propeller": "Propeller", "battery": "Battery", "frame": "Frame", "payload": "Payload"}


def nums(s):
    return [float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*\.?\d*", s)]


def first(rx, s, grp=1):
    m = re.search(rx, s, re.I)
    return float(m.group(grp).replace(",", "")) if m else None


def grams(s):
    m = re.search(r"(\d[\d,]*\.?\d*)\s*(?:±\s*[\d.]+\s*)?(kg|g)\b", s, re.I)
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    return v * 1000 if m.group(2).lower() == "kg" else v


def maxS(s):
    ms = re.findall(r"(\d{1,2})\s*S\b", s, re.I)
    return max(map(float, ms)) if ms else None


# 카테고리별 (속성키, 라벨 정규식, 값 파서, 단위)
SPEC = {
    "motor": [
        ("kv", r"^k\s?v", lambda v: first(r"(\d{2,5})", v), "rpm/V"),
        ("maxCells", r"정격 전압|전압 범위|최대 셀|^배터리", maxS, "S"),
        ("ratedCells", r"정격 전압", lambda v: min(map(float, re.findall(r"(\d{1,2})\s*S\b", v)), default=None), "S"),
        ("maxThrustG", r"최대 추력|^추력", lambda v: (first(r"(\d[\d,]*\.?\d*)\s*kg", v) or 0) * 1000 or first(r"(\d[\d,]*)\s*g\b", v), "g"),
        ("maxPowerW", r"최대 연속 출력|max power|정격 출력", lambda v: first(r"(\d[\d,]*)\s*W", v), "W"),
        ("maxCurrentA", r"최대 연속 전류|peak current", lambda v: first(r"(\d[\d,]*\.?\d*)\s*A\b", v), "A"),
        ("ratedCurrentA", r"정격 전류", lambda v: first(r"(\d[\d,]*\.?\d*)\s*A\b", v), "A"),
        ("weightG", r"^무게(\(|$)", grams, "g"),
        ("resistanceMohm", r"내부 저항|^저항", lambda v: first(r"(\d+\.?\d*)\s*m\s*[ΩΩ]", v), "mΩ"),
    ],
    "esc": [
        ("maxCells", r"입력 전압|전압 범위|^전압", maxS, "S"),
        ("contCurrentA", r"연속 전류|연속/버스트|연속/피크", lambda v: first(r"(\d[\d,]*\.?\d*)\s*A", v), "A"),
        ("peakCurrentA", r"피크 전류|연속/버스트|연속/피크", lambda v: (lambda a: float(a[1]) if len(a) > 1 else None)(re.findall(r"(\d+)\s*A\b", v)), "A"),
        ("weightG", r"^무게(\(|$)", grams, "g"),
    ],
    "propeller": [
        ("diameterIn", r"^직경$|직경/피치|크기/피치", lambda v: first(r"(\d{1,2}\.?\d*)", v), "in"),
        ("pitchIn", r"^피치$|직경/피치|크기/피치", lambda v: (nums(re.sub(r"[xX×]", " ", v)) + [None, None])[1], "in"),
        ("weightG", r"^무게(\(|$)", grams, "g"),
    ],
    "battery": [
        ("cells", r"전압/구성|^전압$|^공칭 전압", lambda v: first(r"(\d{1,2})\s*S\b", v), "S"),
        ("capMah", r"^용량$|셀 용량", lambda v: first(r"(\d[\d,]*)\s*mAh", v) or ((first(r"(\d+\.?\d*)\s*Ah", v) or 0) * 1000 or None), "mAh"),
        ("cRate", r"방전율|연속 방전", lambda v: first(r"(\d{1,3})\s*C\b", v), "C"),
        ("weightG", r"^무게|크기/무게|셀 무게", grams, "g"),
        ("wh_per_kg", r"에너지 밀도", lambda v: first(r"(\d{2,4})\s*Wh/kg", v), "Wh/kg"),
    ],
    "frame": [
        ("wheelbaseMm", r"휠베이스", lambda v: first(r"(\d{3,4})\s*mm", v), "mm"),
        ("maxTakeoffKg", r"최대.*이륙|MTOW", lambda v: first(r"(\d+\.?\d*)\s*kg", v), "kg"),
        ("maxPayloadKg", r"최대 페이로드", lambda v: first(r"(\d+\.?\d*)\s*kg", v), "kg"),
        ("maxFlightMin", r"비행 ?시간", lambda v: first(r"(\d{1,3})\s*(?:min|분)", v), "min"),
        ("weightG", r"^무게|프레임 무게|공칭 중량", grams, "g"),
    ],
    "payload": [
        ("weightG", r"^무게|단독 무게|무게/크기", grams, "g"),
        ("powerW", r"^전력|소비 전력", lambda v: first(r"(\d+\.?\d*)\s*W\b", v), "W"),
    ],
}


RANGE = {  # (클래스, 키): (최소, 최대) — 벗어나면 파싱 오류로 보고 버린다
    ("motor", "weightG"): (20, 3000), ("motor", "kv"): (20, 4000), ("motor", "maxCurrentA"): (5, 300),
    ("esc", "weightG"): (3, 400), ("esc", "contCurrentA"): (5, 300), ("esc", "peakCurrentA"): (10, 500),
    ("propeller", "weightG"): (5, 300), ("propeller", "diameterIn"): (2, 40),
    ("battery", "weightG"): (10, 20000), ("payload", "weightG"): (20, 20000),
    ("frame", "weightG"): (100, 60000), ("payload", "powerW"): (1, 500),
}


def parse(path):
    t = open(path, encoding="utf-8").read()
    fm = dict(re.findall(r"^(\w+):\s*(.+)$", t.split("---")[1], re.M))
    cat = fm["category"].strip()
    title = fm["title"].strip().strip('"')
    props, raw = {}, {}
    rows = re.findall(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", t, re.M)
    for label, value in rows:
        if label in ("항목",) or set(label) <= set("-: "):
            continue
        for key, rx, fn, unit in SPEC.get(cat, []):
            if key in props or not re.search(rx, label, re.I):
                continue
            try:
                v = fn(value)
            except Exception:
                v = None
            if v:
                props[key] = {"value": v, "unit": unit, "raw": f"{label}: {value}"[:120]}
    if cat == "battery":  # 제목에 용량·셀수가 있는 제품(예: 16000mAh 6S)
        if "cells" not in props and (c := first(r"\b(\d{1,2})S\b", title)):
            props["cells"] = {"value": c, "unit": "S", "raw": f"제목: {title}"}
        if "capMah" not in props and (c := first(r"(\d{3,6})\s*mAh", title)):
            props["capMah"] = {"value": c, "unit": "mAh", "raw": f"제목: {title}"}
    for k in list(props):
        lo_hi = RANGE.get((cat, k))
        if lo_hi and not (lo_hi[0] <= props[k]["value"] <= lo_hi[1]):
            del props[k]
    pk, ct = props.get("peakCurrentA"), props.get("contCurrentA")
    if pk and ct and pk["value"] < ct["value"]:
        del props["peakCurrentA"]
    return {
        "id": os.path.basename(path)[:-3],
        "class": CLASS_OF.get(cat, cat),
        "name": title,
        "manufacturer": fm.get("manufacturer", "").strip().strip('"'),
        "source": fm.get("source", "").strip(),
        "doc": os.path.basename(path),
        "props": props,
    }


items = [parse(p) for p in sorted(glob.glob(os.path.join(SRC, "product-*.md")))]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"_comment": "HW 제품 인스턴스(자동 파싱, 결정론). 값은 제조사 공식 문서 기반, 비어 있으면 미확인.", "instances": items}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for i in items:
    print(f"{i['class']:9} {i['name'][:38]:38}", {k: v["value"] for k, v in i["props"].items()})
