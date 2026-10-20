#!/usr/bin/env python3
"""제조사·제품·공학 규칙·논문 claim 지식그래프 생성 (결정론, AI 없음).
입력: data/ontology/{products-catalog,rules,claims}.json (+ paper-claims.json 있으면 포함)
출력: data/ontology/graph.json  {nodes:[{id,type,label,...}], edges:[{s,p,o,...}], stats}
관계는 사양 필드에서 코드가 판정한다: madeBy, isA, powersWith(ESC≥모터 전류·셀 겹침), packFits(배터리 셀 수가 ESC/모터 범위 안),
supports(claim→규칙), reportedIn(claim→논문), governs(규칙→제품 클래스)
실행: python3 -I scripts/build-graph.py
"""
import json, os, re
from collections import Counter

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ontology")
load = lambda f: json.load(open(os.path.join(D, f)))
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")

CLASS = {"engine": "Engine", "motor": "Motor", "esc": "ESC", "propeller": "Propeller", "battery": "Battery", "frame": "Frame",
         "fc": "FlightController", "compute": "CompanionComputer", "datalink": "Datalink", "sensor": "Sensor", "payload": "Payload"}
# 규칙이 지배하는 제품 클래스 (규칙 ID → 클래스). 코드 상수와 같은 정의에서 가져온 수동 매핑이라 rules.json의 where/formula 기준으로 검토 대상.
GOVERNS = {"R01": ["Motor", "Propeller"], "R02": ["Propeller"], "R03": ["Motor"], "R04": ["Propeller"], "R05": ["Battery"], "R06": ["Frame"],
           "R09": ["Battery"], "R11": ["Battery"], "R12": ["Propeller", "Frame"], "R13": ["Frame"], "C02": ["ESC", "Motor"], "C03": ["Propeller"]}

nodes, edges, seen = [], [], set()
def node(i, t, label, **kw):
    if i not in seen:
        seen.add(i); nodes.append({"id": i, "type": t, "label": label, **kw})
def edge(s, p, o, **kw): edges.append({"s": s, "p": p, "o": o, **kw})

items = load("products-catalog.json")["items"]
for c in set(CLASS.values()): node(f"class:{c}", "Class", c)
rng = lambda x: (x["min"], x["max"]) if isinstance(x, dict) and x.get("min") and x.get("max") else None
overlap = lambda a, b: a and b and a[0] <= b[1] and b[0] <= a[1]

prods = {}
for p in items:
    cls = CLASS.get(p["category"])
    if not cls: continue
    mid = f"mfr:{slug(p['manufacturer'])}"
    node(mid, "Manufacturer", p["manufacturer"])
    node(p["id"], "Product", p["name"], cls=cls, url=p.get("url"))
    edge(p["id"], "madeBy", mid); edge(p["id"], "isA", f"class:{cls}")
    prods[p["id"]] = p

# 고정익·VTOL 수집본(products-fwvtol.json): 멀티로터 호환 판정(powersWith/packFits)에는 섞지 않고 노드·제조사·분류만 편입
fw_path = os.path.join(D, "products-fwvtol.json")
fw_items = load("products-fwvtol.json")["items"] if os.path.exists(fw_path) else []
for p in fw_items:
    cls = CLASS.get(p["category"])
    if not cls: continue
    mid = f"mfr:{slug(p['manufacturer'])}"
    node(mid, "Manufacturer", p["manufacturer"])
    node(p["id"], "Product", p["name"], cls=cls, url=p.get("url"), platform=p["platform"], numeric=p.get("numeric") or {}, domain="fixed-wing/vtol")
    edge(p["id"], "madeBy", mid); edge(p["id"], "isA", f"class:{cls}")
    prods[p["id"]] = {"name": p["name"], "manufacturer": p["manufacturer"], "category": p["category"]}

escs = [p for p in items if p["category"] == "esc" and rng(p.get("cells"))]
bats = [p for p in items if p["category"] == "battery" and p.get("cells_S")]
cnt = Counter()
for b in bats:
    s = int(b["cells_S"])
    for e in escs:
        if rng(e["cells"])[0] <= s <= rng(e["cells"])[1]: edge(b["id"], "packFits", e["id"], cells=s); cnt["packFits(배터리→ESC)"] += 1
    for m in (q for q in items if q["category"] == "motor"):
        rs = [r for v in m.get("variants", []) for r in [rng(v.get("cells"))] if r]
        if rs and any(r[0] <= s <= r[1] for r in rs): edge(b["id"], "packFits", m["id"], cells=s); cnt["packFits(배터리→모터)"] += 1
for m in (q for q in items if q["category"] == "motor"):
    vs = [(v, rng(v.get("cells")), (v.get("max_current_A") or {}).get("value")) for v in m.get("variants", [])]
    vs = [x for x in vs if x[1] and x[2]]
    for e in escs:
        a = e.get("continuous_A")
        if not a: continue
        ok = [v for v, r, i in vs if overlap(r, rng(e["cells"])) and a >= i]
        if ok:
            er, mr = rng(e["cells"]), [r for v, r, i in vs if v in ok]
            edge(e["id"], "powersWith", m["id"], contA=a, motorMaxA=min((v.get("max_current_A") or {}).get("value") for v in ok),
                 escCells=f"{er[0]}-{er[1]}S", motorCells=f"{min(r[0] for r in mr)}-{max(r[1] for r in mr)}S",
                 sharedCells=f"{max(er[0], min(r[0] for r in mr))}-{min(er[1], max(r[1] for r in mr))}S")
            cnt["powersWith(ESC≥모터전류)"] += 1

# 2nd 제조사 레지스트리 병합: 웹 카탈로그 제조사와 이름 매핑된 곳은 국가·공식 URL을 붙이고, 레지스트리에만 있는 제조사는 분야(hasCategory)와 함께 노드로 추가
RCLS = {"motor": "Motor", "esc": "ESC", "propeller": "Propeller", "battery": "Battery", "frame": "Frame", "fc": "FlightController", "compute": "CompanionComputer",
        "datalink": "Datalink", "camera": "Sensor", "lidar": "Sensor", "radar": "Sensor", "gnss-imu": "Sensor", "payload-mech": "Payload"}
mp = load("manufacturer-map.json")
web2reg = {x["web"]: x["registry"] for x in mp["matched"]}
for web, regname in web2reg.items():
    nd = next((n for n in nodes if n["id"] == f"mfr:{slug(web)}"), None)
    r = mp["registry"].get(regname)
    if nd and r: nd.update(registryName=regname, country=r["country"], countryVerified=r["countryVerified"], officialUrl=r["url"])
regdone = set(web2reg.values())
for name, r in mp["registry"].items():
    mid = next((f"mfr:{slug(w)}" for w, rn in web2reg.items() if rn == name), f"mfr:{slug(name)}")
    node(mid, "Manufacturer", name, registryName=name, country=r["country"], countryVerified=r["countryVerified"], officialUrl=r["url"], inRegistry=True)
    for c in r["cats"]:
        if c in RCLS: edge(mid, "hasCategory", f"class:{RCLS[c]}")
rules = load("rules.json"); rules = rules.get("rules", rules)
claims = load("claims.json")["claims"]
if os.path.exists(os.path.join(D, "paper-claims.json")): claims += load("paper-claims.json")["claims"]
for r in rules:
    node(f"rule:{r['id']}", "Rule", f"{r['id']} {r['name']}", status=r["status"], sourceStatus=r.get("sourceStatus", "unverified"))
    for c in GOVERNS.get(r["id"], []): edge(f"rule:{r['id']}", "governs", f"class:{c}")
# claim 주제 → 제품 클래스 (topic은 추출 시 붙인 분류, 규칙 연결은 GOVERNS 경유)
TOPIC = {"propulsion": ["Motor", "Propeller"], "battery": ["Battery"], "energy": ["Battery"], "structure": ["Frame"], "flight-controller": ["FlightController"],
         "companion": ["CompanionComputer"], "comms": ["Datalink"], "payload": ["Payload", "Sensor"]}
# 제품 언급 판정: 제조사명을 뺀 제품명에서 2~3단어 구(예: "orin nx", "mid-360", "pixhawk 6x")를 만들고 claim 본문에 그대로 있으면 연결.
# 용량·일반어만 있는 구(16gb, brushless motor 등)는 오탐이라 제외.
GENERIC = {"series", "module", "kit", "brushless", "motor", "battery", "propeller", "props", "frame", "drone", "developer", "version", "lipo", "esc", "the", "and", "with", "for", "pro", "mini", "flight", "controller", "computer", "camera", "sensor", "lidar", "radio", "system"}
def phrases(p):
    name = re.sub(r"\(.*?\)", " ", p["name"].lower()).replace(p["manufacturer"].lower(), " ")
    w = [x for x in re.findall(r"[a-z0-9][a-z0-9\-\.]*", name)]
    out = {x for x in w if len(x) >= 4 and re.search(r"\d", x) and re.search(r"[a-z]", x) and not re.fullmatch(r"\d+(gb|mb|mah|kv|mm|in)", x)}
    for n in (2, 3):
        for i in range(len(w) - n + 1):
            g = w[i:i + n]
            if all(x in GENERIC or re.fullmatch(r"\d+(gb|mb|mah|s|v|a|w|kv)?", x) for x in g): continue
            if not any(re.search(r"[a-z]", x) and x not in GENERIC for x in g): continue
            ph = " ".join(g)
            if len(ph) >= 6: out.add(ph)
    return out
pphr = {pid: phrases(p) for pid, p in prods.items()}
for c in claims:
    node(f"claim:{c['id']}", "Claim", f"{c['subject']}: {c['value']}", status=c["status"], source=c["sourceId"],
         evidenceKind=c.get("evidenceKind") or ("derived" if c["status"] == "derived" else "reported"), attribute=c.get("attribute", ""), unit=c.get("unit", ""), conditions=c.get("conditions", ""), locator=c.get("locator", ""), quote=c.get("quote", ""))
    for cls in TOPIC.get(c.get("topic", ""), []): edge(f"claim:{c['id']}", "about", f"class:{cls}")
    text = re.sub(r"\s+", " ", f"{c['subject']} {c.get('quote', '')}".lower())
    best = {}
    for pid, phs in pphr.items():
        hit = [ph for ph in phs if re.search(r"(?<![a-z0-9])" + re.escape(ph) + r"(?![a-z0-9])", text)]
        if hit: best[pid] = max(hit, key=len)
    # 가장 긴 일치만 채택, 같은 길이로 여러 제품이 걸리면(예: "jetson orin"→Nano/NX/AGX) 모호하므로 연결하지 않는다
    top = max((len(v) for v in best.values()), default=0)
    win = [pid for pid, v in best.items() if len(v) == top]
    if len(win) == 1: edge(f"claim:{c['id']}", "mentions", win[0], phrase=best[win[0]])
    pid = f"paper:{c['sourceId']}"
    node(pid, "Paper" if c["sourceType"] == "paper" else "Source", c["sourceId"], title=(c.get("paper") or {}).get("title", ""), published=(c.get("paper") or {}).get("published", ""))
    edge(f"claim:{c['id']}", "reportedIn", pid)
    for rid in c.get("rules", []): edge(f"claim:{c['id']}", "supports", f"rule:{rid}")
# rules.json의 claims 목록(수동 큐레이션 연결)도 supports 엣지로 반영 — claim 쪽 rules에 없어도 규칙 쪽에서 지정한 근거를 놓치지 않는다
_have = {(e["s"], e["o"]) for e in edges if e["p"] == "supports"}
for r in rules:
    for cid in r.get("claims", []):
        if f"claim:{cid}" in seen and (f"claim:{cid}", f"rule:{r['id']}") not in _have: edge(f"claim:{cid}", "supports", f"rule:{r['id']}")

stats = {"nodes": Counter(n["type"] for n in nodes), "edges": Counter(e["p"] for e in edges), "compat": cnt}
json.dump({"_comment": "scripts/build-graph.py가 생성(결정론). 수정은 입력 JSON에서.", "nodes": nodes, "edges": edges,
           "stats": {k: dict(v) for k, v in stats.items()}}, open(os.path.join(D, "graph.json"), "w"), ensure_ascii=False)
print(json.dumps({k: dict(v) for k, v in stats.items()}, ensure_ascii=False, indent=1)); print(os.path.getsize(os.path.join(D, "graph.json")) // 1024, "KB")
