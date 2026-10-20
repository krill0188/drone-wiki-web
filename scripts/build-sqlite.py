#!/usr/bin/env python3
"""지식그래프 관계형 저장소(SQLite) 생성 + 정합성 검사. 결정론, AI 없음.

입력: data/ontology/{graph.json, claims.json, paper-claims.json, products-catalog.json, rules.json, manufacturer-map.json}
      + (선택) ~/projectm/hw-collection/20261019/papers-ontology/{candidates_*.json, pdf/*.pdf}
출력: data/ontology/knowledge.sqlite  (읽기 전용 분석·감사용. 웹은 아직 graph.json을 쓴다)

테이블: manufacturers, products, rules, papers, claims, claim_rules, edges, paper_files
무결성: 외래키 + 아래 audit()의 SQL 검사(고아 claim, 규칙 미연결, 인용문 없는 verified, 중복 등). 위반이 있으면 종료 코드 1.
실행: python3 -I scripts/build-sqlite.py [--check]
"""
import glob, hashlib, json, os, sqlite3, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = os.path.join(ROOT, "data", "ontology")
OUT = os.path.join(D, "knowledge.sqlite")
PAPERS = os.path.expanduser("~/projectm/hw-collection/20261019/papers-ontology")
load = lambda f: json.load(open(os.path.join(D, f)))

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE manufacturers (id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT, country_verified INTEGER, official_url TEXT, in_registry INTEGER DEFAULT 0, has_specs INTEGER DEFAULT 0);
CREATE TABLE products (id TEXT PRIMARY KEY, manufacturer_id TEXT NOT NULL REFERENCES manufacturers(id), category TEXT NOT NULL, name TEXT NOT NULL, url TEXT, captured TEXT,
  weight_g REAL, capacity_mah REAL, cells_s INTEGER, nominal_v REAL, continuous_a REAL, peak_a REAL, esc_cells_min INTEGER, esc_cells_max INTEGER);
CREATE TABLE rules (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('definition','heuristic','empirical')), source_status TEXT, formula TEXT, note TEXT);
CREATE TABLE papers (id TEXT PRIMARY KEY, title TEXT, published TEXT, topic TEXT, url TEXT);
CREATE TABLE paper_files (paper_id TEXT PRIMARY KEY REFERENCES papers(id), sha256 TEXT, bytes INTEGER, local_path TEXT);
CREATE TABLE claims (id TEXT PRIMARY KEY, paper_id TEXT REFERENCES papers(id), source_id TEXT NOT NULL, source_type TEXT NOT NULL, subject TEXT NOT NULL, attribute TEXT, value TEXT,
  unit TEXT, conditions TEXT, locator TEXT, quote TEXT, status TEXT NOT NULL CHECK (status IN ('verified','derived')),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('reported','model-assumption','simulation','cited-secondary','derived')), topic TEXT);
CREATE TABLE claim_rules (claim_id TEXT NOT NULL REFERENCES claims(id), rule_id TEXT NOT NULL REFERENCES rules(id), PRIMARY KEY (claim_id, rule_id));
CREATE TABLE edges (s TEXT NOT NULL, p TEXT NOT NULL, o TEXT NOT NULL, attrs TEXT, PRIMARY KEY (s, p, o));
CREATE INDEX idx_products_cat ON products(category); CREATE INDEX idx_products_mfr ON products(manufacturer_id);
CREATE INDEX idx_claims_paper ON claims(paper_id); CREATE INDEX idx_claims_kind ON claims(evidence_kind);
CREATE INDEX idx_edges_p ON edges(p); CREATE INDEX idx_edges_o ON edges(o);
"""

# 무결성·감사 SQL: (설명, 위반 행을 돌려주는 쿼리). 결과가 비어야 통과.
AUDIT = [
    ("verified claim인데 인용문이 비어 있음 (논문 출처 verified는 quote 필수)",
     "SELECT id FROM claims WHERE status='verified' AND source_type='paper' AND (quote IS NULL OR length(quote) < 15)"),
    ("조건(conditions)이 비어 있는 claim (조건 없는 일반화 금지)",
     "SELECT id FROM claims WHERE conditions IS NULL OR trim(conditions)=''"),
    ("제품인데 제조사가 레지스트리/카탈로그에 없음", "SELECT p.id FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id WHERE m.id IS NULL"),
    ("배터리 제품의 용량·셀 수가 비정상(0 이하)", "SELECT id FROM products WHERE category='battery' AND (capacity_mah<=0 OR cells_s<=0)"),
    ("ESC 연속전류가 피크전류보다 큼", "SELECT id FROM products WHERE category='esc' AND continuous_a IS NOT NULL AND peak_a IS NOT NULL AND continuous_a > peak_a"),
    ("구현된 실측 상수 규칙(empirical)인데 근거 claim이 하나도 없음", "SELECT r.id FROM rules r LEFT JOIN claim_rules cr ON cr.rule_id=r.id WHERE r.status='implemented' AND r.kind='empirical' AND cr.rule_id IS NULL"),
    ("같은 규칙에 연결된 모델 가정·시뮬레이션 값만으로 'verified' 판정된 규칙",
     "SELECT r.id FROM rules r WHERE r.source_status='verified' AND NOT EXISTS (SELECT 1 FROM claim_rules cr JOIN claims c ON c.id=cr.claim_id WHERE cr.rule_id=r.id AND c.evidence_kind IN ('reported','derived'))"),
]


def build():
    if os.path.exists(OUT):
        os.remove(OUT)
    db = sqlite3.connect(OUT)
    db.executescript(SCHEMA)
    g = load("graph.json")
    mp = load("manufacturer-map.json")
    items = {p["id"]: p for p in load("products-catalog.json")["items"]}

    web_mfr = set()
    for n in g["nodes"]:
        if n["type"] == "Manufacturer":
            db.execute("INSERT INTO manufacturers VALUES (?,?,?,?,?,?,?)", (n["id"], n["label"], n.get("country"), None if n.get("country") is None else int(bool(n.get("countryVerified"))),
                                                                                n.get("officialUrl"), int(bool(n.get("inRegistry"))), 0))
    for e in g["edges"]:
        if e["p"] == "madeBy":
            web_mfr.add(e["o"])
    db.executemany("UPDATE manufacturers SET has_specs=1 WHERE id=?", [(m,) for m in web_mfr])
    mfr_of = {e["s"]: e["o"] for e in g["edges"] if e["p"] == "madeBy"}
    for pid, mid in mfr_of.items():
        p = items.get(pid)
        if not p:
            continue
        cells = p.get("cells") or {}
        wt = p.get("weight_g")
        db.execute("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            pid, mid, p["category"], p["name"], p.get("url"), p.get("captured"), wt.get("value") if isinstance(wt, dict) else wt, p.get("capacity_mAh"), p.get("cells_S"),
            p.get("nominal_V"), p.get("continuous_A"), p.get("peak_A"), cells.get("min") if isinstance(cells, dict) else None, cells.get("max") if isinstance(cells, dict) else None))

    rules = load("rules.json"); rules = rules.get("rules", rules)
    for r in rules:
        db.execute("INSERT INTO rules VALUES (?,?,?,?,?,?,?)", (r["id"], r["name"], r["status"], r.get("kind", "empirical"), r.get("sourceStatus"), r.get("formula"), r.get("note")))

    # 논문 메타(수집 후보 목록) + PDF 파일 해시. 파일 자체는 웹에 올리지 않고 로컬 경로·해시만 보관한다.
    meta = {}
    for f in glob.glob(os.path.join(PAPERS, "candidates_*.json")):
        for p in json.load(open(f)):
            meta[p["arxiv"]] = p

    claims = load("claims.json")["claims"] + load("paper-claims.json")["claims"]
    for c in claims:
        sid = c["sourceId"]
        pid = sid.split("arXiv:")[1] if sid.startswith("arXiv:") else None
        if pid and not db.execute("SELECT 1 FROM papers WHERE id=?", (pid,)).fetchone():
            m = meta.get(pid) or {}
            title = m.get("title") or (c.get("paper") or {}).get("title") or ""
            db.execute("INSERT INTO papers VALUES (?,?,?,?,?)", (pid, title, m.get("published") or (c.get("paper") or {}).get("published"), m.get("topic"), f"https://arxiv.org/abs/{pid}"))
            pdf = os.path.join(PAPERS, "pdf", f"{pid}.pdf")
            if os.path.exists(pdf):
                h = hashlib.sha256(open(pdf, "rb").read()).hexdigest()
                db.execute("INSERT INTO paper_files VALUES (?,?,?,?)", (pid, h, os.path.getsize(pdf), pdf))
        kind = c.get("evidenceKind") or ("derived" if c["status"] == "derived" else "reported")
        db.execute("INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            c["id"], pid, sid, c["sourceType"], c["subject"], c.get("attribute"), str(c["value"]), c.get("unit"), c.get("conditions"), c.get("locator"), c.get("quote"),
            c["status"], kind, c.get("topic")))
        for r in c.get("rules", []):
            db.execute("INSERT OR IGNORE INTO claim_rules VALUES (?,?)", (c["id"], r))
    # 규칙 → claim 연결은 rules.json의 claims 목록도 반영(수동 큐레이션 claim)
    for r in rules:
        for cid in r.get("claims", []):
            if db.execute("SELECT 1 FROM claims WHERE id=?", (cid,)).fetchone():
                db.execute("INSERT OR IGNORE INTO claim_rules VALUES (?,?)", (cid, r["id"]))

    for e in g["edges"]:
        attrs = {k: v for k, v in e.items() if k not in ("s", "p", "o")}
        db.execute("INSERT OR IGNORE INTO edges VALUES (?,?,?,?)", (e["s"], e["p"], e["o"], json.dumps(attrs, ensure_ascii=False) if attrs else None))
    db.commit()
    return db


def audit(db):
    bad = 0
    print("무결성 검사")
    fk = db.execute("PRAGMA foreign_key_check").fetchall()
    print(("  ✅" if not fk else "  ❌") + f" 외래키 위반 {len(fk)}건")
    bad += len(fk)
    for desc, q in AUDIT:
        rows = [r[0] for r in db.execute(q).fetchall()]
        print(("  ✅ " if not rows else "  ❌ ") + desc + ("" if not rows else f" → {len(rows)}건: {rows[:5]}"))
        bad += len(rows)
    return bad


WARN = [
    ("경험칙(heuristic) 규칙인데 근거 claim 없음", "SELECT r.id FROM rules r LEFT JOIN claim_rules cr ON cr.rule_id=r.id WHERE r.status='implemented' AND r.kind='heuristic' AND cr.rule_id IS NULL"),
    ("추진·배터리·구조·사이징 주제인데 규칙에 연결되지 않은 논문 claim (규칙 후보 검토 대상)",
     "SELECT c.id FROM claims c LEFT JOIN claim_rules r ON r.claim_id=c.id WHERE r.claim_id IS NULL AND c.source_type='paper' AND c.topic IN ('propulsion','battery','energy','structure','forward-flight','sizing')"),
]


def warnings(db):
    print("\n경고(실패 아님, 보완 대상)")
    for desc, q in WARN:
        rows = [r[0] for r in db.execute(q).fetchall()]
        print(("  ✅ " if not rows else "  ⚠ ") + desc + ("" if not rows else f" → {len(rows)}건: {rows[:6]}"))


def summary(db):
    q = lambda s: db.execute(s).fetchall()
    print("\n집계")
    for t in ("manufacturers", "products", "rules", "papers", "paper_files", "claims", "claim_rules", "edges"):
        print(f"  {t}: {q(f'SELECT count(*) FROM {t}')[0][0]}")
    print("  증거 종류:", dict(q("SELECT evidence_kind, count(*) FROM claims GROUP BY 1")))
    print("  규칙별 근거(실측 보고값 / 전체):")
    for r in q("""SELECT r.id, r.source_status, sum(c.evidence_kind IN ('reported','derived')), count(*) FROM rules r JOIN claim_rules cr ON cr.rule_id=r.id
                  JOIN claims c ON c.id=cr.claim_id GROUP BY r.id ORDER BY count(*) DESC LIMIT 12"""):
        print(f"    {r[0]:4} {str(r[1]):22} {r[2]}/{r[3]}")


if __name__ == "__main__":
    db = build()
    bad = audit(db)
    warnings(db)
    summary(db)
    db.close()
    print(f"\n{OUT} ({os.path.getsize(OUT) // 1024} KB)")
    sys.exit(1 if bad and "--check" in sys.argv else 0)
