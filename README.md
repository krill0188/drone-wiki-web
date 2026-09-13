# DroneWiki

드론/AI/로보틱스 지식을 제공하는 공개 위키와 AI Q&A 애플리케이션.
원본은 `~/2nd`; `data/wiki/`는 검토된 공개 발행 snapshot이다.

## 현재 실행 경계 — Stage 0-R, 2026-09-13

```text
~/2nd (source of truth)
  raw → canonical → ontology / derived artifacts
                       |
launchd sync @08:30 → legacy wrapper → scripts/sync-wiki.sh
                       |
             publication-preflight.py (audit only)
                       |
       lint / kinetic check / embedding freshness / publication gate
                       |
             HOLD: no snapshot write / push / deploy

data/wiki (existing public snapshot, unchanged) → existing Vercel deployment
```

Stage 0-R은 기존 구조를 보존하며 발행 경계를 강화한다. 원격 push와 배포는 별도 승인 전 실행하지 않는다.
기존 파일 해시는 공개 분류를 추정하는 수단이 아니라 기존 bytes 보존 기준이다.
신규/변경 bytes는 `~/2nd/publication/policy.json`의 문서 해시 승인 또는 명시적 public 문서/디렉터리 정책이 필요하다.
private/internal/restricted 또는 deny 메타데이터는 allow보다 우선한다.
원문뿐 아니라 벡터·그래프·뉴스·브리핑도 자동 복사하지 않는다.

## 자동화와 쓰기 동작

| 경로 | 현재 동작 | 시각/환경 |
|---|---|---|
| sync | 검증/audit만 수행, source와 snapshot 변경 없음 | launchd 08:30 |
| self-update | 예약 래퍼가 `--apply`로 canonical 뉴스 섹션을 직접 수정. 이전 proposal-only 설명은 잘못됨 | launchd 08:20, 로컬 전용 |
| self-update review | UI에서 사람이 선택한 제안 반영 | 로컬 전용 |
| discovery review | 사람이 검토한 개념의 canonical 승격 | 로컬 전용 |

08:00 ingest, 08:20 self-update, 08:45 discovery, 08:47 canonical graph, 08:50 kinetic은 현재 독립 launchd jobs이다.
시간 간격은 완료 의존성이 아니다. 새 순차 실행 후보는 `~/2nd/scripts/knowledge-pipeline.py`이며,
중복 legacy jobs가 loaded 상태이면 실행을 거부한다. 스케줄 전환은 아직 활성화하지 않았다.

## 데이터와 검색

```text
data/wiki/
  concepts/ entities/ comparisons/ queries/   canonical
  raw/                                       원문·미검증 증거
  ontology/                                  클래스 계층
  .ua/
    drone-knowledge-graph.json                canonical graph
    discovery-knowledge-graph.json            미검증 discovery graph
    embeddings.json                          배포된 문서 벡터
    news-feed.json / daily-briefing.json       뉴스 / 브리핑
```

- `knowledge-graph.json`은 legacy fallback 이름이다. 현재 canonical 전용 파일은 `drone-knowledge-graph.json`이다.
- `lib/rag.ts`: local Python + 동일 모델 + 문서 벡터를 사용할 수 있을 때 hybrid(0.6 cosine + 0.4 keyword).
- 문서 벡터가 있어도 query vector가 없으면 keyword fallback. 현재 Next.js/Vercel 빌드는 Python venv를 설치하지 않으므로 production은 코드/구성상 keyword-only로 귀결된다(INFERRED). live function invocation은 UNKNOWN.
- `lib/graphrag.ts`는 canonical + discovery를 함께 탐색하고 origin을 구분한다. 미검증 discovery를 canonical 사실로 승격하는 것은 아니다.
- RAG raw 범위는 papers/articles/youtube/videos/releases, 로컬 embed generator는 papers/articles/youtube/notebooklm/transcripts/web이다. 범위 차이를 임의로 확대하지 않았으며 일부 raw는 keyword-only일 수 있다.

## 기능

| 기능 | 경로 | 환경 |
|---|---|---|
| AI Q&A | `/chat` | production keyword fallback, local hybrid 조건부 |
| 위키/그래프/뉴스 | `/wiki`, `/graph`, `/news` | production |
| 드론빌더 | `/ai-drone-builder` | production |
| self-update/discovery review | `/self-update-review`, `/discovery-review` | 로컬 전용 |

## 배포와 검증

기존 운영 로그에는 Git push 후 Vercel CLI 배포가 기록돼 있다. 현재 sync는 audit-only이므로 자동배포하지 않는다.
2026-09-13 17:56:28 배포 성공 로그는 이번 변경 **이전** 증거이며 새 코드의 배포 성공을 의미하지 않는다.
`proxy.ts`는 Next.js 16 로컬 공식 가이드에 맞춰 middleware 파일과 export 이름만 변경했다. UUID 쿠키 동작은 유지한다.

상세 변경·검증·rollback·미해결 항목: [Stage 0-R re-baseline](docs/STAGE_0R_REBASELINE.md).
이전 감사는 [역사적 baseline](docs/2026-09-13-architecture-audit.md)이며 최신 판정은 Stage 0-R 문서를 따른다.
