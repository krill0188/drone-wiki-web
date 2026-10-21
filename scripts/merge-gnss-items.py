#!/usr/bin/env python3
"""GNSS 제품 수집분(hw-collection/20261021/to_wiki.py가 만든 gnss-items.json)을 웹 제품 카탈로그에 병합한다.
같은 id가 있으면 덮어쓰고 없으면 추가한다. 다른 항목은 건드리지 않는다. 사양 값은 수집 파일의 표 값 그대로(미확인 행은 제외).
실행: python3 -I scripts/merge-gnss-items.py <gnss-items.json>
"""
import json, os, sys
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ontology", "products-catalog.json")
new = json.load(open(sys.argv[1], encoding="utf-8"))
raw = open(P, encoding="utf-8").read()
cat = json.loads(raw)
by = {i["id"]: n for n, i in enumerate(cat["items"])}
added = updated = 0
for it in new:
    if it["id"] in by: cat["items"][by[it["id"]]] = it; updated += 1
    else: cat["items"].append(it); added += 1
cat["count"] = len(cat["items"])
ind = 1 if raw.startswith('{\n "') else 2
open(P, "w", encoding="utf-8").write(json.dumps(cat, ensure_ascii=False, indent=ind) + ("\n" if raw.endswith("\n") else ""))
print(f"추가 {added}, 갱신 {updated}, 전체 {cat['count']}")
