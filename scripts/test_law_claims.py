#!/usr/bin/env python3
"""법령 조문 claim 시험(네트워크 없음). 실행: python3 -I scripts/test_law_claims.py
①파서·검증기 단위(합성 조문: 항·호·목, 문자열/리스트 조문내용, 가지번호, 삭제, 메타 키, 불일치 탐지) ②데이터 무결성(선정↔claim 1:1, 누출 0, 시행일·URL 형식) ③DB 덤프와 일치."""
import importlib.util, json, os, re, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
OD = os.path.join(HERE, "..", "data", "ontology")
spec = importlib.util.spec_from_file_location("alc", os.path.join(HERE, "add-law-claims.py"))
alc = importlib.util.module_from_spec(spec); spec.loader.exec_module(alc)

ART = {"조문번호": "9", "조문여부": "조문", "조문제목": "시험", "조문시행일자": "20260101", "조문내용": "제9조(시험)",
       "항": [{"항번호": "①", "항내용": "① 첫째 항 <개정 2020.1.1>", "항제개정유형": "개정", "항제개정일자문자열": "2020.1.1",
              "호": [{"호번호": "1.", "호내용": "1. 호 하나", "목": [{"목번호": "가.", "목내용": ["가. 목 하나"]}]}, {"호번호": "2.", "호내용": "2. 호 둘"}]},
             {"항번호": "②", "항내용": "② 둘째 항"}]}


def law_payload(units, name="시험법"):
    return {"법령": {"기본정보": {"법령명_한글": name, "시행일자": "20260101", "조문시행일자문자열": "20260301:제9조제1항, 20260401:제90조제1항"}, "조문": {"조문단위": units}}}


class Parser(unittest.TestCase):
    def test_render_structure_and_indent(self):
        t = alc.render(ART).split("\n")
        self.assertEqual(t[0], "제9조(시험)"); self.assertEqual(t[1], "① 첫째 항 <개정 2020.1.1>")
        self.assertEqual(t[2], "  1. 호 하나"); self.assertEqual(t[3], "    가. 목 하나"); self.assertEqual(t[5], "② 둘째 항")

    def test_independent_leaves_match_and_exclude_meta(self):
        a = {k: v for k, v in ART.items() if k != "조문제목"}
        self.assertEqual(alc.norm(alc.render(ART)), alc.norm("".join(alc.leaves(a))))
        self.assertNotIn("2020.1.1", [x for x in alc.leaves(a) if x == "2020.1.1"])  # 항제개정일자문자열 메타는 잎이 아님

    def test_single_clause_and_list_head(self):
        a = {"조문번호": "3", "조문여부": "조문", "조문내용": ["제3조(정의) 본문", "둘째 줄"]}
        self.assertEqual(alc.render(a), "제3조(정의) 본문\n둘째 줄")

    def test_key_of_branch(self):
        self.assertEqual(alc.key_of({"조문번호": "125", "조문가지번호": "2"}), "제125조의2")
        self.assertEqual(alc.key_of({"조문번호": "122"}), "제122조")

    def test_partial_dates_exact_article_only(self):
        base = law_payload([])["법령"]["기본정보"]
        self.assertEqual(alc.partial_dates(base, "9", None), ["2026-03-01"])
        self.assertEqual(alc.partial_dates(base, "90", None), ["2026-04-01"])  # 제9조가 제90조와 섞이지 않음
        self.assertEqual(alc.partial_dates(base, "9", "2"), [])

    def run_build(self, units, sel_article="제9조"):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        d = os.path.join(tmp.name, "law_t"); os.makedirs(d)
        with open(os.path.join(d, "100-abcdef012345.json"), "w", encoding="utf-8") as fh:
            json.dump(law_payload(units), fh, ensure_ascii=False)
        sel = {"articles": [{"law": "law:t", "name": "시험법", "article": sel_article, "title": "시험"}]}
        return alc.build(sel, tmp.name)

    def test_build_ok(self):
        claims, problems, _ = self.run_build([ART])
        self.assertEqual(problems, []); c = claims[0]
        self.assertEqual((c["id"], c["effective"], c["partial_effective"], c["url"]), ("LAW-t-9", "2026-01-01", ["2026-03-01"], "https://www.law.go.kr/법령/시험법/제9조"))

    def test_missing_deleted_and_duplicate_articles_are_problems(self):
        self.assertIn("0건", self.run_build([ART], "제10조")[1][0])
        dele = dict(ART, 조문내용="제9조 삭제", 항=None)
        self.assertIn("삭제", self.run_build([dele])[1][0])
        self.assertIn("2건", self.run_build([ART, ART])[1][0])

    def test_mismatch_detection(self):
        bad = dict(ART, 추가필드="렌더러가 모르는 본문 조각")  # 원문 노드에 렌더러가 안 읽는 문자열이 있으면 반드시 잡는다
        self.assertIn("원문 노드와 다름", self.run_build([bad])[1][0])

    def test_section_headings_are_not_articles(self):
        head = {"조문번호": "9", "조문여부": "전문", "조문내용": "제2장 시험"}
        claims, problems, _ = self.run_build([head, ART]); self.assertEqual(problems, []); self.assertEqual(len(claims), 1)


class Data(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sel = json.load(open(os.path.join(OD, "law-selection.json"), encoding="utf-8"))
        cls.doc = json.load(open(os.path.join(OD, "law-claims.json"), encoding="utf-8"))
        cls.laws = {l["id"]: l["name"] for l in json.load(open(os.path.join(OD, "laws.json"), encoding="utf-8"))["laws"]}

    def test_selection_confirmed_and_sized(self):
        self.assertIs(self.sel["confirmed"], True); self.assertEqual(len(self.sel["articles"]), 80)
        self.assertEqual(len({(e["law"], e["article"]) for e in self.sel["articles"]}), 80)
        self.assertTrue(all(e["law"] in self.laws and self.laws[e["law"]] == e["name"] for e in self.sel["articles"]))
        mil = sorted(e["article"] for e in self.sel["articles"] if e["law"] == "law:military-base-act")
        self.assertEqual(mil, sorted(["제2조", "제6조", "제9조", "제10조", "제24조"]))

    def test_claims_match_selection_one_to_one(self):
        got = {(c["law_id"], c["article"]) for c in self.doc["claims"]}
        self.assertEqual(got, {(e["law"], e["article"]) for e in self.sel["articles"]}); self.assertEqual(len(self.doc["claims"]), 80)
        self.assertEqual(len({c["id"] for c in self.doc["claims"]}), 80)

    def test_claim_fields(self):
        for c in self.doc["claims"]:
            self.assertRegex(c["id"], r"^LAW-[a-z-]+-\d+(-\d+)?$"); self.assertRegex(c["effective"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertRegex(c["sha256"], r"^[0-9a-f]{64}$"); self.assertTrue(c["text"].startswith(c["article"] + "(") or c["text"].startswith(c["article"]), c["id"])
            self.assertEqual(c["law_name"], self.laws[c["law_id"]]); self.assertTrue(c["url"].startswith("https://www.law.go.kr/법령/") and c["url"].endswith("/" + c["article"]))
            self.assertNotIn(" ", c["url"]); self.assertFalse(c["text"].strip().endswith("삭제"))

    def test_no_secret_or_private_url_leak(self):
        raw = open(os.path.join(OD, "law-claims.json"), encoding="utf-8").read()
        self.assertIsNone(re.search(r"OC=|lawService|lawSearch|법령상세링크|\.ua/", raw))

    def test_text_is_raw_not_summary(self):
        c = next(x for x in self.doc["claims"] if x["id"] == "LAW-aviation-safety-act-122")
        self.assertIn("신고수리 여부를 신고인에게 통지하여야 한다. <신설 2020.6.9>", c["text"])  # 개정 주석까지 원문 그대로

    def test_db_dump_matches_claims(self):
        sql = open(os.path.join(HERE, "..", "data", "knowledge", "knowledge.sql"), encoding="utf-8").read()
        import sqlite3
        db = sqlite3.connect(":memory:"); db.executescript(sql)
        rows = {r[0]: r for r in db.execute("SELECT id, text, effective, url FROM law_articles")}
        self.assertEqual(set(rows), {c["id"] for c in self.doc["claims"]})
        for c in self.doc["claims"]: self.assertEqual(rows[c["id"]][1:], (c["text"], c["effective"], c["url"]))
        self.assertEqual(db.execute("SELECT count(*) FROM claims WHERE id LIKE 'LAW-%'").fetchone()[0], 0)  # claims 테이블에는 섞이지 않는다


if __name__ == "__main__":
    unittest.main()
