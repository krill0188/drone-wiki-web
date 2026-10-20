#!/usr/bin/env python3
"""knowledge DB 생성기 테스트. 소형 fixture(임시 디렉터리)와 실제 발행 스냅샷 양쪽에서 검증한다.
실행: ~/2nd/.venv/bin/python scripts/test_knowledge_db.py
"""
import glob, hashlib, json, os, re, sqlite3, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "..")
BUILDER = os.path.join(HERE, "build-knowledge-db.py")
PY = sys.executable


def build(wiki, ont, src, out_sql, extra=()):
    r = subprocess.run([PY, BUILDER, "--wiki-root", wiki, "--ontology-dir", ont, "--source-root", src, "--papers-dir", "/nonexistent", "--out-sql", out_sql, "--quality", "", *extra],
                       capture_output=True, text=True)
    return r


def load_sql(path):
    db = sqlite3.connect(":memory:")
    db.executescript(open(path, encoding="utf-8").read())
    return db


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)


class Fixture(unittest.TestCase):
    """경계 사례를 모은 소형 위키: domain 정상 / 없음 / 미등록 / 출처 없음 / contested."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="kdb-fixture-")
        wiki, ont, src = (os.path.join(cls.tmp, d) for d in ("wiki", "ont", "src"))
        fm = lambda **k: "---\n" + "\n".join(f"{a}: {b}" for a, b in k.items()) + "\n---\n"
        base = dict(created="2026-10-01", updated="2026-10-02", type="concept", confidence="high", contested="false", contradictions="[]")
        w(f"{wiki}/concepts/a-hw.md", fm(title='"배터리 에너지 밀도"', domain="hardware", tags="[drone, battery]", sources="[inbox/x.md]", **base) +
          "# A\n\nLiPo 팩의 에너지 밀도는 약 155Wh/kg이다.^[inbox/x.md] 연결은 [[b-fc]] 참조.\n")
        w(f"{wiki}/concepts/b-fc.md", fm(title='"비행 제어기"', domain="flight-control", tags="[drone, fc]", sources="[]", ontology_class="FlightController", **base) + "# B\n\n비행 제어기 문서.\n")
        w(f"{wiki}/concepts/c-nodomain.md", fm(title='"도메인 없음"', tags="[drone]", sources="[]", **base) + "# C\n\n본문.\n")
        w(f"{wiki}/concepts/d-unreg.md", fm(title='"미등록 도메인"', domain="swarm", tags="[drone, swarm]", sources="[]", **base) + "# D\n\n군집.\n")
        w(f"{wiki}/concepts/e-nosrc.md", fm(title='"출처 없는 문장"', domain="hardware", tags="[drone]", sources="[inbox/missing.md]", **base) + "# E\n\n존재하지 않는 출처를 인용한 문장이다.^[inbox/missing.md]\n")
        w(f"{wiki}/concepts/g-badnum.md", fm(title='"출처에 없는 수치"', domain="hardware", tags="[drone]", sources="[inbox/z.md]", **base) + "# G\n\n이 팩의 에너지 밀도는 약 999Wh/kg이다.^[inbox/z.md]\n")
        c = dict(base); c["contested"] = "true"
        w(f"{wiki}/concepts/f-contested.md", fm(title='"충돌 claim"', domain="hardware", tags="[drone]", sources="[inbox/y.md]", **c) + "# F\n\n두 출처가 서로 다른 값을 주장하는 문장이다.^[inbox/y.md]\n")
        w(f"{wiki}/ontology/class-hierarchy.json", json.dumps({"classes": {"Thing": {"parent": None}, "PhysicalEntity": {"parent": "Thing"}, "Motor": {"parent": "PhysicalEntity"},
                                                                        "ESC": {"parent": "PhysicalEntity"}, "FlightController": {"parent": "PhysicalEntity"}}}))
        w(f"{src}/inbox/processed/x.md", "LiPo pack specific energy 155 Wh/kg"); w(f"{src}/inbox/processed/y.md", "원본 Y"); w(f"{src}/inbox/processed/z.md", "unrelated text, no figures here")
        g = {"nodes": [{"id": "mfr:acme", "type": "Manufacturer", "label": "Acme"}, {"id": "p-motor", "type": "Product", "label": "Acme MX5008 Motor", "cls": "Motor"},
                       {"id": "p-esc", "type": "Product", "label": "Acme ESC 60A", "cls": "ESC"}, {"id": "rule:R1", "type": "Rule", "label": "R1 hover", "status": "implemented"},
                       {"id": "paper:arXiv:1", "type": "Paper", "label": "arXiv:1"}, {"id": "class:Motor", "type": "Class", "label": "Motor"}, {"id": "class:ESC", "type": "Class", "label": "ESC"}],
             "edges": [{"s": "p-motor", "p": "madeBy", "o": "mfr:acme"}, {"s": "p-esc", "p": "madeBy", "o": "mfr:acme"}, {"s": "p-motor", "p": "isA", "o": "class:Motor"},
                       {"s": "p-esc", "p": "isA", "o": "class:ESC"}, {"s": "p-esc", "p": "powersWith", "o": "p-motor", "contA": 60},
                       {"s": "claim:CL1", "p": "supports", "o": "rule:R1"}]}
        w(f"{ont}/graph.json", json.dumps(g))
        w(f"{ont}/rules.json", json.dumps({"rules": [{"id": "R1", "name": "hover", "status": "implemented", "kind": "empirical", "sourceStatus": "verified", "claims": ["CL1"]}]}))
        w(f"{ont}/claims.json", json.dumps({"claims": [{"id": "CL1", "rules": ["R1"], "subject": "hover power", "attribute": "P", "value": "100", "unit": "W", "conditions": "test rig",
                                                           "sourceType": "paper", "sourceId": "arXiv:1", "locator": "II-A", "quote": "the hover power was 100 W on the test rig", "status": "verified"}]}))
        w(f"{ont}/products-catalog.json", json.dumps({"items": [{"id": "p-motor", "category": "motor", "manufacturer": "Acme", "name": "Acme MX5008 Motor", "url": "http://a"},
                                                                   {"id": "p-esc", "category": "esc", "manufacturer": "Acme", "name": "Acme ESC 60A", "url": "http://b", "continuous_A": 60, "peak_A": 80}]}))
        cls.sql = os.path.join(cls.tmp, "out.sql")
        cls.proc = build(wiki, ont, src, cls.sql)
        cls.db = load_sql(cls.sql) if cls.proc.returncode == 0 else None

    def q(self, sql, p=()): return self.db.execute(sql, p).fetchall()

    def test_00_builds(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr[-500:])

    def test_domain_preserved_verbatim(self):
        d = dict(self.q("SELECT path, domain FROM documents"))
        self.assertEqual(d["concepts/a-hw.md"], "hardware")
        self.assertEqual(d["concepts/b-fc.md"], "flight-control")
        self.assertIsNone(d["concepts/c-nodomain.md"], "domain 없는 문서는 NULL 유지(추론 금지)")
        self.assertEqual(d["concepts/d-unreg.md"], "swarm", "미등록 값도 그대로 보존")

    def test_domain_registered_flag_only_judges(self):
        r = dict(self.q("SELECT path, domain_registered FROM documents"))
        self.assertEqual((r["concepts/a-hw.md"], r["concepts/d-unreg.md"]), (1, 0))
        self.assertIsNone(r["concepts/c-nodomain.md"])

    def test_tags_and_domain_separate(self):
        tags = {(a, b) for a, b in self.q("SELECT d.path, t.tag FROM document_tags t JOIN documents d ON d.id=t.document_id")}
        self.assertIn(("concepts/a-hw.md", "battery"), tags)
        self.assertNotIn(("concepts/a-hw.md", "hardware"), tags, "domain 값이 tags로 섞이면 안 됨")
        expected = {"concepts/a-hw.md": {"drone", "battery"}, "concepts/b-fc.md": {"drone", "fc"}, "concepts/c-nodomain.md": {"drone"}, "concepts/d-unreg.md": {"drone", "swarm"},
                    "concepts/e-nosrc.md": {"drone"}, "concepts/f-contested.md": {"drone"}, "concepts/g-badnum.md": {"drone"}}
        got = {}
        for path, tag in tags: got.setdefault(path, set()).add(tag)
        self.assertEqual(got, expected, "DB tags는 frontmatter tags와 정확히 같아야 함(domain에서 만들거나 추가하지 않음)")

    def test_fts_with_domain_filter(self):
        hit = self.q("SELECT document_id FROM document_fts WHERE document_fts MATCH ? AND domain=?", ("에너지", "hardware"))
        self.assertEqual(sorted(h[0] for h in hit), ["doc:concepts/a-hw.md", "doc:concepts/g-badnum.md"], "hardware domain 두 문서가 검색됨")
        self.assertEqual(self.q("SELECT document_id FROM document_fts WHERE document_fts MATCH ? AND domain=?", ("에너지", "flight-control")), [])

    def test_ontology_class_and_relation_queries(self):
        self.assertEqual(self.q("SELECT id FROM ontology_nodes WHERE class_name='Motor'"), [("p-motor",)])
        self.assertEqual(self.q("SELECT subject_id, object_id, status, confidence FROM ontology_relations WHERE predicate='powersWith'"), [("p-esc", "p-motor", "derived", "high")])
        self.assertEqual(self.q("SELECT id FROM ontology_nodes WHERE origin='frontmatter'"), [("page:b-fc",)], "frontmatter에 명시된 ontology_class만 노드가 됨")

    def test_paper_claim_has_verified_evidence_with_quote_and_source(self):
        r = self.q("SELECT c.status, c.confidence, e.quote, e.verified, s.source_type, s.source_url FROM claims c JOIN evidence e ON e.claim_id=c.id JOIN sources s ON s.id=e.source_id WHERE c.id='CL1'")
        self.assertEqual(r[0][:4], ("verified", "high", "the hover power was 100 W on the test rig", 1))
        self.assertEqual(r[0][4:], ("paper", "https://arxiv.org/abs/1"))

    def test_wiki_claim_status_caps_at_sourced(self):
        st = {p: s for p, s in self.q("SELECT d.path, c.status FROM claims c JOIN documents d ON d.id=c.document_id WHERE c.origin='wiki'")}
        self.assertEqual(st["concepts/a-hw.md"], "sourced", "inbox/x.md → inbox/processed/x.md 이동을 따라 해석되어 sourced")
        self.assertEqual(st["concepts/e-nosrc.md"], "blocked", "출처 파일이 없으면 blocked")
        self.assertEqual(st["concepts/g-badnum.md"], "unverified", "문장의 숫자가 출처 파일에 하나도 없으면 unverified(수치 지지도 0)")
        self.assertEqual(st["concepts/f-contested.md"], "contested")
        self.assertEqual(self.q("SELECT count(*) FROM claims WHERE origin='wiki' AND status='verified'")[0][0], 0, "위키 요약 claim은 verified가 될 수 없음")

    def test_numeric_support_score_recorded(self):
        r = dict(self.q("SELECT d.path, e.support_score FROM evidence e JOIN claims c ON c.id=e.claim_id JOIN documents d ON d.id=c.document_id WHERE c.origin='wiki'"))
        self.assertEqual(r["concepts/a-hw.md"], 1.0)
        self.assertEqual(r["concepts/g-badnum.md"], 0.0)
        self.assertIsNone(r["concepts/f-contested.md"], "숫자 없는 문장은 NULL(중립)")

    def test_every_claim_has_evidence_and_fk_clean(self):
        self.assertEqual(self.q("SELECT count(*) FROM claims c LEFT JOIN evidence e ON e.claim_id=c.id WHERE e.id IS NULL")[0][0], 0)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_wikilink_goes_to_document_links_not_ontology(self):
        self.assertEqual(self.q("SELECT source_document_id, target_document_id FROM document_links"), [("doc:concepts/a-hw.md", "doc:concepts/b-fc.md")])
        self.assertEqual(self.q("SELECT count(*) FROM ontology_relations WHERE predicate='wikilink'")[0][0], 0)

    def test_no_discovery_graph_data(self):
        self.assertEqual(self.q("SELECT count(*) FROM ontology_nodes WHERE origin LIKE '%discovery%'")[0][0], 0)
        self.assertEqual(self.q("SELECT count(*) FROM sources WHERE source_url LIKE '%discovery%' OR ref LIKE '%discovery%'")[0][0], 0)

    def test_deterministic(self):
        second = os.path.join(self.tmp, "out2.sql")
        r = build(os.path.join(self.tmp, "wiki"), os.path.join(self.tmp, "ont"), os.path.join(self.tmp, "src"), second)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(open(self.sql, "rb").read(), open(second, "rb").read())


class RealSnapshot(unittest.TestCase):
    """실제 발행 스냅샷(data/wiki)에서 원본 frontmatter와 DB의 일치를 독립 파서로 확인한다."""

    @classmethod
    def setUpClass(cls):
        cls.sql = os.path.join(WEB, "data", "knowledge", "knowledge.sql")
        cls.db = load_sql(cls.sql) if os.path.exists(cls.sql) else None

    def setUp(self):
        if self.db is None: self.skipTest("knowledge.sql 없음 — 먼저 build-knowledge-db.py 실행")

    def test_domain_matches_original_frontmatter_100pct(self):
        db_dom = dict(self.db.execute("SELECT path, domain FROM documents").fetchall())
        bad, n = [], 0
        for layer in ("concepts", "entities", "comparisons", "queries"):
            for fp in glob.glob(os.path.join(WEB, "data", "wiki", layer, "*.md")):
                rel = f"{layer}/{os.path.basename(fp)}"
                with open(fp, encoding="utf-8", errors="replace") as fh: t = fh.read()
                m = re.match(r"---\n(.*?)\n---", t, re.S)
                fmtxt = m.group(1) if m else ""
                dm = re.search(r"^domain:\s*(.*?)\s*$", fmtxt, re.M)
                orig = None if not dm else dm.group(1).strip().strip("'\"")
                n += 1
                if db_dom.get(rel) != orig: bad.append((rel, orig, db_dom.get(rel)))
        self.assertEqual(bad, [], f"domain 불일치 {len(bad)}/{n}")
        self.assertEqual(len(db_dom), n)

    def test_tags_come_only_from_frontmatter(self):
        n_db = self.db.execute("SELECT count(*) FROM document_tags").fetchone()[0]
        self.assertGreater(n_db, 500)

    def test_fts_korean_and_domain(self):
        r = self.db.execute("SELECT count(*) FROM document_fts WHERE document_fts MATCH ? AND domain=?", ("배터리", "hardware")).fetchone()[0]
        self.assertGreater(r, 0)

    def test_integrity(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.db.execute("SELECT count(*) FROM claims c LEFT JOIN evidence e ON e.claim_id=c.id WHERE e.id IS NULL").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM claims WHERE origin='wiki' AND status='verified'").fetchone()[0], 0)

    def test_source_resolution_rate(self):
        t, r = self.db.execute("SELECT count(*), sum(resolved=1) FROM sources WHERE document_id IS NOT NULL AND resolved IS NOT NULL").fetchone()
        self.assertGreaterEqual(r / t, 0.95, f"출처 해석률 {r}/{t}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
