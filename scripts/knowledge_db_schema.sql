-- 드론 지식 RDB 스키마 (파생 계층). Git/Markdown이 원본이고 이 DB는 build-knowledge-db.py가 결정론적으로 재생성한다.
-- 기존 domain은 documents.domain에 frontmatter 값을 그대로 저장한다(재분류·정규화·추론 금지).
-- tags / domain / ontology class는 서로 다른 개념이며 별도 테이블·열이다.
PRAGMA foreign_keys = OFF;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- ── 문서 계층 (canonical Wiki) ─────────────────────────────────────────────
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  domain TEXT,                        -- frontmatter 값 그대로. 없으면 NULL
  status TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  domain_registered INTEGER,          -- 공식 domain 목록에 있으면 1, 없으면 0, domain이 없으면 NULL (판정만 기록, 값은 안 고침)
  domain_hint TEXT,                   -- 경로 등에서 파생된 힌트. 권위 없음, domain과 분리
  hint_source TEXT,
  confidence TEXT,
  contested INTEGER NOT NULL DEFAULT 0,
  contradictions TEXT,
  ontology_class TEXT,                -- frontmatter에 명시된 경우만
  body TEXT NOT NULL DEFAULT ''
);
CREATE TABLE document_tags (
  document_id TEXT NOT NULL REFERENCES documents(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (document_id, tag)
);
CREATE TABLE document_links (          -- Wiki graph 전용(문서 탐색용). 온톨로지 관계가 아니다.
  source_document_id TEXT NOT NULL REFERENCES documents(id),
  target_document_id TEXT NOT NULL REFERENCES documents(id),
  link_type TEXT NOT NULL,
  PRIMARY KEY (source_document_id, target_document_id, link_type)
);

-- ── 출처 ────────────────────────────────────────────────────────────────────
CREATE TABLE papers (id TEXT PRIMARY KEY, title TEXT, published TEXT, topic TEXT, url TEXT);
CREATE TABLE paper_files (paper_id TEXT PRIMARY KEY REFERENCES papers(id), sha256 TEXT, bytes INTEGER, local_path TEXT);
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id),   -- 위키 문서가 인용한 출처면 그 문서
  paper_id TEXT REFERENCES papers(id),          -- 논문 출처면 그 논문
  source_url TEXT,
  source_type TEXT NOT NULL,                    -- url | inbox | raw | paper | catalog | derived | other
  captured_at TEXT,
  sha256 TEXT NOT NULL,                         -- 해석된 파일의 해시. 해석 실패면 ''
  locator TEXT,
  raw_path TEXT,                                -- 실제로 해석된 경로(inbox→processed 이동 추적)
  resolved INTEGER,                             -- 1 해석됨 / 0 실패 / NULL 확인 불가(원본 루트 없음)
  ref TEXT                                      -- 문서에 적힌 원래 출처 표기
);

-- ── 온톨로지 ────────────────────────────────────────────────────────────────
CREATE TABLE ontology_classes (name TEXT PRIMARY KEY, parent TEXT);
CREATE TABLE ontology_nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  class_name TEXT NOT NULL,
  domain TEXT,
  canonical INTEGER NOT NULL DEFAULT 1,
  origin TEXT NOT NULL                          -- catalog | paper | rule | frontmatter | instance | registry
);
-- 공식 계층(class-hierarchy.json)에 없는 클래스는 임의로 추가하지 않고 제안으로만 기록한다(사람 검토·승인 대상)
CREATE TABLE ontology_class_proposals (name TEXT PRIMARY KEY, proposed_parent TEXT, reason TEXT NOT NULL, node_count INTEGER NOT NULL);
-- 문서 → 온톨로지 클래스 연결 '제안'. documents.ontology_class는 절대 자동으로 바꾸지 않고, 사람이 승인한 것만 frontmatter에 반영한다.
-- tier A: 슬러그·제목에 클래스 고유 키워드, 단일 클래스 / B: 여러 클래스 후보 / C: 태그만 일치
CREATE TABLE ontology_node_proposals (
  document_id TEXT NOT NULL REFERENCES documents(id),
  proposed_class TEXT NOT NULL,
  match_field TEXT NOT NULL,        -- slug | title | tag
  matched_keyword TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('A','B','C')),
  status TEXT NOT NULL DEFAULT 'proposed',
  PRIMARY KEY (document_id, proposed_class, matched_keyword)
);
CREATE TABLE ontology_aliases (alias TEXT NOT NULL, node_id TEXT NOT NULL REFERENCES ontology_nodes(id), PRIMARY KEY (alias, node_id));
CREATE TABLE ontology_relations (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_id TEXT NOT NULL,
  source_claim_id TEXT,
  status TEXT NOT NULL,                         -- verified | derived | unreviewed | blocked
  confidence TEXT NOT NULL,                     -- high | medium | low
  attrs TEXT
);

-- ── claim / evidence ────────────────────────────────────────────────────────
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id),
  paper_id TEXT REFERENCES papers(id),
  subject_id TEXT REFERENCES ontology_nodes(id),
  subject_text TEXT,                            -- 주어의 서술형 표기(예: 'AeroEval battery packaging multiplier'). 온톨로지 노드가 없는 주어도 검색·표시되게 함
  predicate TEXT NOT NULL,
  object_value TEXT NOT NULL,
  unit TEXT,
  conditions TEXT,
  domain TEXT,                                  -- 추론하지 않는다. 문서 소속 claim만 그 문서 domain을 그대로 복사
  origin TEXT NOT NULL,                         -- paper | manufacturer | derived | wiki
  status TEXT NOT NULL,                         -- verified | sourced | unverified | blocked | contested
  confidence TEXT NOT NULL,
  contested INTEGER NOT NULL DEFAULT 0,
  evidence_kind TEXT NOT NULL,                  -- reported | model-assumption | simulation | cited-secondary | derived | wiki-summary
  topic TEXT
);
CREATE TABLE claim_rules (claim_id TEXT NOT NULL REFERENCES claims(id), rule_id TEXT NOT NULL, PRIMARY KEY (claim_id, rule_id));
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  locator TEXT,
  quote TEXT NOT NULL,
  evidence_type TEXT NOT NULL,                  -- verbatim-quote | wiki-summary | derived-calc
  verified INTEGER NOT NULL DEFAULT 0,
  verification_method TEXT,
  support_score REAL,                           -- 위키 요약 문장의 숫자가 출처 파일에 있는 비율(0~1). 숫자가 없는 문장은 NULL
  support_detail TEXT
);

-- ── 기존 구조 보존 (제품·제조사·규칙) ────────────────────────────────────────
CREATE TABLE manufacturers (id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT, country_verified INTEGER, official_url TEXT, in_registry INTEGER DEFAULT 0, has_specs INTEGER DEFAULT 0);
CREATE TABLE products (
  id TEXT PRIMARY KEY, manufacturer_id TEXT NOT NULL REFERENCES manufacturers(id), category TEXT NOT NULL, name TEXT NOT NULL, url TEXT, captured TEXT,
  weight_g REAL, capacity_mah REAL, cells_s INTEGER, nominal_v REAL, continuous_a REAL, peak_a REAL, esc_cells_min INTEGER, esc_cells_max INTEGER, platform TEXT, numeric_json TEXT
);
CREATE TABLE rules (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('definition','heuristic','empirical')), source_status TEXT, formula TEXT, note TEXT);
CREATE TABLE edges (s TEXT NOT NULL, p TEXT NOT NULL, o TEXT NOT NULL, attrs TEXT, PRIMARY KEY (s, p, o));

-- ── 질의 후보 (ontology 노드에서 결정론적으로 생성) ──────────────────────────
CREATE TABLE query_candidates (id TEXT PRIMARY KEY, node_id TEXT NOT NULL, template TEXT NOT NULL, example_question TEXT NOT NULL);

-- ── 인덱스 ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_documents_domain ON documents(domain);
CREATE INDEX idx_documents_type_domain ON documents(document_type, domain);
CREATE INDEX idx_ontology_class ON ontology_nodes(class_name);
CREATE INDEX idx_ontology_domain ON ontology_nodes(domain);
CREATE INDEX idx_aliases_alias ON ontology_aliases(alias);
CREATE INDEX idx_relations_subject ON ontology_relations(subject_id);
CREATE INDEX idx_relations_object ON ontology_relations(object_id);
CREATE INDEX idx_claims_subject ON claims(subject_id);
CREATE INDEX idx_claims_domain ON claims(domain);
CREATE INDEX idx_claims_origin_status ON claims(origin, status);
CREATE INDEX idx_claims_document ON claims(document_id);
CREATE INDEX idx_evidence_claim ON evidence(claim_id);
CREATE INDEX idx_sources_document ON sources(document_id);
CREATE INDEX idx_products_cat ON products(category);
CREATE INDEX idx_products_mfr ON products(manufacturer_id);
CREATE INDEX idx_edges_p ON edges(p);
CREATE INDEX idx_edges_o ON edges(o);

-- ── 검색 (내용은 덤프의 마지막에 기본 테이블에서 채운다) ──────────────────────
CREATE VIRTUAL TABLE document_fts USING fts5(document_id UNINDEXED, domain, title, body, tags, tokenize='unicode61');
CREATE VIRTUAL TABLE claim_fts USING fts5(claim_id UNINDEXED, subject, predicate, object_value, conditions, tokenize='unicode61');
