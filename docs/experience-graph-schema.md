# Experience Graph 스키마 설계안 (초안, 2026-10-16)

목적: AI 에디터·챗·드론빌더의 사용자 입력/대화를 RDB(Supabase Postgres)에 쌓고,
정리된 관계만 `origin = "experience"` 그래프 층으로 올려 검색 보조 신호로 쓴다.
canonical(검토된 위키) · discovery(자동추출) 위에 얹는 세 번째 층이며 사실 근거로는 쓰지 않는다.

## 원칙
1. 원본 로그(raw)와 파생 그래프(derived)를 분리한다. 그래프는 로그에서 재생성 가능해야 한다.
2. experience 관계는 승격 전까지 `status = candidate`; 검색 가중치는 보조(×0.3 이하)로만.
3. 익명 세션(`dw_sid` 쿠키)만 식별자로 쓴다. IP·UA 원문은 저장하지 않는다.
4. 서버(service role)만 쓰기/읽기. 브라우저에서 직접 접근 금지(RLS deny-all).

## 테이블 (raw 층)

```sql
create table sessions (
  id           text primary key,              -- dw_sid
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

create table turns (                            -- 챗/에디터/빌더 한 번의 호출
  id           uuid primary key default gen_random_uuid(),
  session_id   text references sessions(id),
  feature      text not null check (feature in ('chat','wiki-editor','drone-builder','discovery-draft','bot')),
  question     text not null,                   -- 마스킹 후 저장
  answer       text,                            -- 마스킹 후 저장
  model        text, latency_ms int, finish_reason text,   -- stop / length / timeout
  created_at   timestamptz not null default now()
);
create index on turns (session_id, created_at);
create index on turns (feature, created_at);

create table retrieval_events (                 -- 어떤 문서가 근거로 쓰였나
  turn_id      uuid references turns(id) on delete cascade,
  doc_slug     text not null,
  source       text not null check (source in ('rag','graph','news')),
  rank         int,
  primary key (turn_id, doc_slug, source)
);

create table builder_runs (                     -- 세션 유지/이어받기의 핵심
  id           uuid primary key default gen_random_uuid(),
  session_id   text references sessions(id),
  concept      text not null,
  status       text not null default 'running' check (status in ('running','done','failed')),
  created_at   timestamptz not null default now()
);
create table builder_stages (
  run_id       uuid references builder_runs(id) on delete cascade,
  stage        text check (stage in ('proposal','spec','architecture')),
  content      text,
  status       text not null default 'pending' check (status in ('pending','running','done','failed')),
  error        text,
  finished_at  timestamptz,
  primary key (run_id, stage)
);

create table editor_edits (                     -- AI 에디터 수정 경험
  id           uuid primary key default gen_random_uuid(),
  session_id   text references sessions(id),
  doc_slug     text,
  instruction  text,
  before_text  text, after_text text,
  accepted     boolean,                         -- 사용자가 채택했는가
  created_at   timestamptz not null default now()
);

create table feedback (
  turn_id      uuid references turns(id) on delete cascade,
  rating       smallint check (rating in (-1, 1)),
  comment      text,
  created_at   timestamptz not null default now()
);
```

## 테이블 (derived 그래프 층)

```sql
create table exp_nodes (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('concept','question_pattern','doc','design_choice')),
  key          text not null,                   -- 정규화 키(slug 또는 패턴 해시)
  label        text,
  unique (type, key)
);

create table exp_edges (
  id           uuid primary key default gen_random_uuid(),
  src          uuid references exp_nodes(id),
  dst          uuid references exp_nodes(id),
  rel          text not null,                   -- asked_with / edited_after / chosen_with / helped_by ...
  weight       real not null default 0,
  distinct_sessions int not null default 0,     -- 서로 다른 세션 수(스팸·편향 방어)
  status       text not null default 'candidate' check (status in ('candidate','reviewed','promoted','rejected')),
  last_seen    timestamptz,
  unique (src, dst, rel)
);

create table exp_evidence (                     -- 관계별 근거(추적성)
  edge_id      uuid references exp_edges(id) on delete cascade,
  turn_id      uuid references turns(id) on delete set null,
  edit_id      uuid references editor_edits(id) on delete set null,
  created_at   timestamptz not null default now()
);
```

## 운영 규칙
- **마스킹(저장 전)**: 이메일·전화·API키 패턴(`sk-`, `nvapi-` 등)·URL 쿼리토큰 치환.
  로그인이 없어도 자유 입력에 개인정보·키가 섞일 수 있어 최소 마스킹은 유지한다.
- **보관**: raw(`turns`, `editor_edits`) 90일 후 삭제, 파생(`exp_*`)은 근거 id만 null 처리 후 유지.
- **검색 반영 조건**: `distinct_sessions >= 3` 이고 `status in (reviewed, promoted)` 인 관계만
  보조 가중치로 사용. candidate는 대시보드(discovery-review 화면 재사용)에서 검토.
- **스팸/오염 방어**: 세션당 시간당 기록 상한, 동일 세션 반복은 distinct_sessions에 1회만 집계.
- **빌더 이어받기**: 클라이언트는 `run_id`를 localStorage에 보관, 재접속 시 서버의
  `builder_stages`에서 완료 단계는 복원하고 미완료 단계만 재요청.

## 구축 순서
1. Supabase 프로젝트 확정(기존 사용 vs 신규 — 신규는 비용 확인 필요) + 위 raw 테이블 생성.
2. `/api/chat`, `/api/drone-builder`, `/api/wiki-editor`에서 비동기로 기록(응답 지연 0 목표,
   기록 실패가 응답을 막지 않게 try/catch + fire-and-forget).
3. 배치(새벽 auto-publish에 단계 추가)로 `exp_*` 생성 → 검토 → 가중치 반영.
4. 효과 측정: 피드백 비율, 응답 시간, 재질문 비율 전후 비교.

## 미결정
- Supabase 프로젝트 선택, 보관 기간(90일 가정), 피드백 UI 유무, 검색 가중치 초기값.
