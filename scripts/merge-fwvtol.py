#!/usr/bin/env python3
"""고정익·VTOL 수집본(hw-collection/20261020/fw-vtol/product-*.json)을 검증·정규화해 data/ontology/products-fwvtol.json으로 병합.
멀티로터 카탈로그(products-catalog.json)와 섞지 않는다 — 고정익 모터가 멀티로터 후보에 끼는 오염을 막기 위한 별도 파일.

검증(코드 판정): 필수 필드, URL 형식, 숫자 필드가 숫자인지, 중복 id, 분류 허용값, 플랫폼 허용값. 위반 항목은 rejected 목록에 사유와 함께 남기고 제외한다.
실행: python3 -I scripts/merge-fwvtol.py
"""
import glob, json, os, sys, collections, datetime

SRC = os.path.expanduser("~/projectm/hw-collection/20261020/fw-vtol")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ontology", "products-fwvtol.json")
CATS = {"motor", "esc", "propeller", "battery", "engine", "frame", "fc", "datalink", "payload"}
PLAT = {"fixed-wing", "vtol"}
NUM = ["weight_g", "kv", "cells_min", "cells_max", "continuous_A", "peak_A", "max_thrust_g", "diameter_in", "pitch_in", "capacity_mAh", "nominal_V", "energy_Wh",
       "power_W", "displacement_cc", "wingspan_mm", "mtow_g", "payload_g", "endurance_min", "cruise_speed_ms"]


def check(r):
    for k in ("id", "category", "platform", "manufacturer", "title", "url"):
        if not r.get(k):
            return f"{k} 없음"
    if r["category"] not in CATS: return f"분류 {r['category']} 허용 안 됨"
    if not isinstance(r["platform"], list) or not set(r["platform"]) <= PLAT or not r["platform"]: return f"platform {r['platform']} 허용 안 됨"
    if not str(r["url"]).startswith("http"): return "url 형식"
    for k, v in (r.get("numeric") or {}).items():
        if v is not None and not isinstance(v, (int, float)): return f"numeric.{k}가 숫자가 아님: {v!r}"
        if isinstance(v, (int, float)) and v < 0: return f"numeric.{k} 음수"
    n = r.get("numeric") or {}
    if n.get("cells_min") and n.get("cells_max") and n["cells_min"] > n["cells_max"]: return "cells_min > cells_max"
    if n.get("continuous_A") and n.get("peak_A") and n["continuous_A"] > n["peak_A"]: return "continuous_A > peak_A"
    return None


def main():
    items, rejected, seen = [], [], set()
    for f in sorted(glob.glob(os.path.join(SRC, "product-*.json"))):
        try:
            r = json.load(open(f))
        except Exception as e:
            rejected.append({"file": os.path.basename(f), "why": f"JSON 오류 {e}"}); continue
        why = check(r)
        if not why and r["id"] in seen: why = "중복 id"
        if why:
            rejected.append({"file": os.path.basename(f), "why": why}); continue
        seen.add(r["id"])
        items.append({
            "id": r["id"], "category": r["category"], "platform": r["platform"], "manufacturer": r["manufacturer"], "name": r["title"], "url": r["url"],
            "captured": r.get("captured"), "specs": r.get("specs") or {}, "numeric": {k: v for k, v in (r.get("numeric") or {}).items() if v is not None}, "note": r.get("note") or "",
        })
    json.dump({"generated": datetime.date.today().isoformat(), "count": len(items),
               "_comment": "고정익·VTOL 제조사 공식 페이지 수집본(에이전트 수집, 코드 검증). 멀티로터 카탈로그와 분리. numeric은 페이지에 적힌 값만, 없으면 키 없음.",
               "items": items}, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"병합 {len(items)}개 · 제외 {len(rejected)}개")
    print("분류:", dict(collections.Counter(i["category"] for i in items)))
    print("제조사:", len({i['manufacturer'] for i in items}))
    for x in rejected[:10]: print("  제외", x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
