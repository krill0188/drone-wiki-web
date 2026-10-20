#!/usr/bin/env python3
"""knowledge.sql의 ontology_node_proposals를 사람이 검토하는 마크다운으로 내보낸다. 자동 반영은 하지 않는다.
실행: python3 -I scripts/export-class-proposals.py > docs/ontology-class-proposals.md
"""
import os, sqlite3, collections
db = sqlite3.connect(":memory:")
db.executescript(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "knowledge", "knowledge.sql"), encoding="utf-8").read())
q = lambda s, p=(): db.execute(s, p).fetchall()
tot_docs = q("SELECT count(*) FROM documents")[0][0]
tiers = dict(q("SELECT tier, count(*) FROM ontology_node_proposals GROUP BY 1"))
print("# 위키 문서 → 온톨로지 클래스 연결 제안 (사람 검토용)\n")
print("> 생성: `scripts/export-class-proposals.py` (결정론 키워드 규칙). **어떤 문서의 `ontology_class`도 자동으로 바꾸지 않았습니다.** 승인한 제안만 해당 문서 frontmatter에 반영하며, 문서 변경은 발행 게이트(해시 승인) 대상입니다.\n")
print(f"- 현재 `ontology_class`가 명시된 문서: {q('SELECT count(*) FROM documents WHERE ontology_class IS NOT NULL')[0][0]} / {tot_docs}")
print(f"- 제안 {sum(tiers.values())}건 · 문서 {q('SELECT count(DISTINCT document_id) FROM ontology_node_proposals')[0][0]}개 · 등급 A {tiers.get('A',0)} · B {tiers.get('B',0)} · C {tiers.get('C',0)}\n")
print("| 등급 | 의미 | 권장 |\n|---|---|---|\n| A | 슬러그·제목에 클래스 고유 키워드, 후보 클래스가 하나 | 일괄 승인 후보 |\n| B | 슬러그·제목에서 여러 클래스가 걸림 | 문서별 검토 |\n| C | 태그만 일치 | 보류(약한 근거) |\n")
for tier, title in (("A", "등급 A — 일괄 승인 후보"), ("B", "등급 B — 문서별 검토")):
    rows = q("SELECT p.proposed_class, d.path, d.title, p.match_field, p.matched_keyword FROM ontology_node_proposals p JOIN documents d ON d.id=p.document_id WHERE p.tier=? ORDER BY p.proposed_class, d.path", (tier,))
    print(f"## {title} ({len(rows)}건)\n")
    by = collections.defaultdict(list)
    for r in rows: by[r[0]].append(r)
    for cls in sorted(by):
        print(f"### {cls} ({len(by[cls])})")
        for _c, path, ttl, field, kw in by[cls]: print(f"- `{path}` — {ttl[:50]} _({field}: {kw})_")
        print()
