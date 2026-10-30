# DroneWiki

> 드론 비행제어·통신·하드웨어·GCS·법규·AI 자율까지 — **근거가 있는 답만 하는** 드론 지식 플랫폼.
> 위키 문서를 읽고, 질문하고, 새 드론 프로젝트를 설계한다. 모든 답은 **온톨로지(구조) → 규칙 추론(계산·판정) → 위키 근거(출처)** 순서로 만들어진다.

운영: <https://drone-wiki-web.vercel.app> · 원본 지식 저장소: [2nd-brain-ai-system](https://github.com/krill0188/2nd-brain-ai-system) (`~/2nd`)

[Stage 0-R follow-up verification](docs/STAGE_0R_FOLLOWUP.md) · [운영 런북](docs/OPERATIONS.md) · [릴리스 노트](docs/RELEASES.md)

## 현재 상태 (2026-10-27)

| 항목 | 값 |
|---|---|
| 발행 문서 | 3,261쪽 — 사람 검토 약 900 + discovery 자동 승격 약 2,350(`confidence: low`, 태그 `unreviewed`, 분류·출처 허브 11개 포함) |
| 지식 DB | claim 3,316(원문 인용 검증 + 위키 문장) · 온톨로지 노드 1,412 · 제품 694 · 제조사 257 (정확한 수치는 `/api/health`) |
| 질의 경로 | `KG_BACKEND=sqlite` — 답변은 **지식그래프의 노드·엣지·검증 claim만** 사실 근거로 쓰고, 모델은 표현만 한다. 근거가 없으면 "그래프에 없음" |
| 모델 | NVIDIA NIM 체인(병렬 헤징 + 토큰 버킷) → OpenRouter `:free` → 모델 없이 근거만 보여 주는 답. NIM·OpenRouter 모두 **키 풀 폴백**(한도·인증 거절 시 다음 키로 전환) |
| AI 드론 빌더 | 6단계 구조 유지. 시작 화면에 필수 4조건(페이로드·비행가능거리·크기·비행시간) 안내 카드 + 예제 3종, 진행 알약, 2단계 배선도, 완성 시 드론 이미지 |
| 수집 동의·경험 로그 | AI 질문하기·AI 드론 빌더는 진입 시 **수집 동의 고지**(기본 strict: 거절하면 사용 불가, 서버 403). 질문·완성 설계는 마스킹 후 별도 무료 Supabase에 **90일** 보관(30일 후 집계만 남김), 테스트 트래픽은 집계 제외 |
| 구글 로그인(선택) | 코드·DB 배포 완료, 로그인 UI는 `NEXT_PUBLIC_AUTH_ENABLED`로 숨김. 켜면 `/my`에서 내 질문·설계 사례 조회/삭제, 계정 삭제, 빌더 기기 간 이어보기. 설정 순서는 [docs/GOOGLE_LOGIN_SETUP.md](docs/GOOGLE_LOGIN_SETUP.md) |
| 운영 점검 | 이 Mac의 launchd 점검 + GitHub Actions `ops-eval`(매일 질문 25문항, 매주 설계 도우미 6단계 회귀). 배포는 `scripts/deploy-prod.sh`만 사용 |

> 자동 승격 문서는 모델 호출 없이 discovery 그래프 정보(이름·분류·출처·관계)로 만든 짧은 문서이며 **사실 근거로 쓰지 않는다.** 내용 검증이 끝난 문서만 claim 근거가 된다.

---

## 1. 기획 — 무엇을 만드는가

드론 지식은 논문·제조사 문서·규정·뉴스·현장 사례에 흩어져 있고, 서로 다른 공학 분야(기계·전기·통신·컴퓨터·제어·SW·ROS)가 얽혀 있다.
DroneWiki는 이를 **한 곳에서 읽고(위키), 묻고(AI Q&A), 만들어 보는(AI 드론 빌더)** 서비스다.

| 기능 | 경로 | 쓰임새 |
|---|---|---|
| **AI Q&A** | `/chat` | 위키 + 지식그래프(GraphRAG) + 온톨로지 추론을 근거로 스트리밍 답변. 텍스트 선택 → 즉시 질문·저장 |
| **위키 / 그래프 / 뉴스** | `/wiki`, `/graph`, `/news` | 발행 문서 3,261쪽(검토 909 + 자동 승격 미검토 약 2,350) 열람, 개념 그래프 탐색(노이즈 필터 focus 모드), 일일 브리핑 |
| **AI 에디터** | `/wiki-editor` | 정리 안 된 메모 → 프론트매터·개요·스펙을 갖춘 문서로 구조화 |
| **AI 드론 빌더** | `/ai-drone-builder` | 컨셉 한 줄 → 기획 → HW → SW → 기술스펙 → 아키텍처 → 코드·로드맵, 6단계 에이전트가 순차 작성 (단계별 승인/반려/마감) |
| **검토 도구(로컬 전용)** | `/self-update-review`, `/discovery-review` | 사람이 AI 제안·발견 개념을 검토해 canonical로 승격 |
| **텔레그램 봇 API** | `/api/bot-chat`, `/api/bot-wiki-editor` | 봇이 같은 RAG·온톨로지 파이프라인을 JSON으로 호출 (`x-bot-token` 인증) |

## 2. 의도 — 왜 이렇게 만드는가

1. **환각을 구조로 막는다.** LLM이 "그럴듯하게" 지어내는 대신, 질문을 먼저 온톨로지 클래스로 해석하고 **규칙 엔진이 계산·판정한 결과를 전제로** 답하게 한다. 수치가 없으면 "확인 필요", 조건이 터무니없으면 "추론상 불가"로 답한다.
2. **출처와 검증 상태를 분리한다.** 사람이 검토한 canonical 지식, AI가 자동 추출한 미검증(discovery) 관계, 저자 정의 설계 지식을 서로 다르게 표시한다. 미검증 관계는 단정하지 않는다.
3. **구조를 아는 AI.** 문서 연결을 나열하는 RAG를 넘어, 부품 간 호환(전압·전류·팁속도·기하), 임무 → 필요 능력 → 구성요소, 분야 간 연쇄(진동 → IMU → 항법)를 **계산으로** 추적해 설계 의사결정을 돕는다.
4. **원본은 한 곳.** 지식의 source of truth는 `~/2nd`. 이 저장소의 `data/wiki/`는 **검토·승인된 공개 발행 snapshot**일 뿐이며, 원문·벡터·뉴스를 무심코 복사하지 않는다.

## 3. 구조

### 3.1 전체 데이터 흐름

```text
~/2nd (source of truth: raw → canonical → ontology)
   │  auto-publish (매일 10:30, 정책·해시 게이트)
   ▼
data/wiki (공개 snapshot, 3,261쪽) ──► Next.js 16 (App Router) ──► Vercel (icn1 서울)
                                          │
                  ┌───────────────────────┼────────────────────────┐
                  ▼                       ▼                        ▼
            RAG / GraphRAG        온톨로지 추론 계층         LLM (NVIDIA NIM
            (키워드 + 그래프)     (구조·규칙·합성)          deepseek-v4.1-flash)
```

### 3.2 AI Q&A 요청 파이프라인 (`app/api/chat/route.ts`)

```text
사용자 질문
  1) 설계 게이트 ── lib/design-gate.ts
       · 드론 설계·구성 질문은 필수 4항목(페이로드·비행가능거리·크기·비행시간) 확인
       · 빠지면 AI 호출 없이 서버가 즉시 재질문 / 물리적으로 불가하면 "추론상 불가" + 가능한 최대치·대안 제시
  2) 온톨로지 컨텍스트 ── lib/ontology-qa.ts
       · 클래스 해석(한/영 별칭) → 계층·관계 → 연관 위키 문서 → 미검증 의미 관계(표시)
       · ontology-reason  : 질문 속 수치 → 규칙 전방추론(PASS/WARN/FAIL), 변경 파급, 필요 입력
       · ontology-create  : 제품 개체 조합 합성, 셀→팩 합성, 정보 빈틈(수집 우선순위)
       · ontology-arch    : 17개 주제 HW+SW 기본구조, 임무→능력 제약 선택, 통신·프로토콜, 분야 간 결합
  3) RAG + GraphRAG + 뉴스 검색 ── lib/rag.ts, lib/graphrag.ts
  4) 시스템 프롬프트 조립 ── lib/chat-system-prompt.ts  (<ontology> <inference> <synthesis> <architecture> <design-gate> 블록)
  5) LLM 스트리밍 응답 + 출처·온톨로지 클래스 메타데이터
```

### 3.3 온톨로지 · 추론 엔진

| 계층 | 파일 | 내용 |
|---|---|---|
| 클래스 계층 | `data/wiki/ontology/class-hierarchy.json` (`~/2nd/ontology` 미러) | 58개 클래스. 문서에 `ontology_class`를 일괄 부여하지 않음(논문·뉴스 오분류 방지) — 문서는 클래스와의 **연관 근거**로만 연결 |
| 관계 | `data/ontology/relations.json` | 33개 (설계서 §2 spec 15 + HW 설계 확장 hw-ext 18). 구조 정의만, 수치 규칙 없음 |
| 추론 규칙 | `lib/ontology-reason.ts` | 23개 규칙. **물리법칙**(단정 가능)과 **설계 경험칙**(통례, 한정 표기)을 구분. 전압→회전수→팁속도, 호버링 전력(운동량 이론), 프롭 간섭, ESC 전류 여유, 배터리 C율 등 |
| 제품 개체 | `data/ontology/instances.json` | 제조사 문서 21종을 속성(값·단위·출처 원문)으로 구조화. 파서: `scripts/build-hw-instances.py` (AI 호출 없음, 물리적 타당 범위 검증, 못 읽으면 비움) |
| 창조형 추론 | `lib/ontology-create.ts` | 모터×ESC×프롭×배터리 조합을 열거해 규칙으로 걸러 점수화, 21700 셀로 직·병렬 팩 합성, 판정을 막은 정보 빈틈을 수집 우선순위로 환원 |
| 기본구조 | `data/ontology/architecture.json` (원본 `scripts/gen-architecture.py`) | 구성요소 54 · 능력 52 · 분야 간 결합 50 · 주제 17 · 통신 링크 7 · 프로토콜 어댑터 14 · 임무 5. **저자 정의 설계 지식(검토 필요)** |
| 기본구조 추론 | `lib/ontology-arch.ts` | 임무 → 능력 폐포(★숨은 의존성), 환경 제약 기반 구성요소 선택, 링크 ✓/✗·자유공간 손실·전파 수평선, 이기종 프로토콜 최단 어댑터 경로, 결합 파급 체인 |

> 추론 결과는 **후보(가설)**이며 실기 시험 전 확정이 아니다. 경험칙 수치(추력중량비 2:1, 에너지밀도 등)는 일반 범위이고 제품별로 다르다.

### 3.4 신뢰성 원칙 (환각 방지)

- **설계 게이트**: 4항목 미입력 시 재질문, 입력이 있어도 물리 한계(보수/낙관 두 가정)로 성립하지 않으면 설계안을 만들지 않는다.
- **스펙 수치는 원문 그대로**: 제품 수치는 문서의 값·단위·측정 조건을 반올림·보간 없이 인용. 엔진 계산값은 "추정"으로 구분. 근거 없으면 "확인 필요".
- **미검증 표시**: discovery 그래프(원문에서 AI 추출, 사람 미검토)의 관계는 `[AI 추출·미검증]`로만 제공.
- **구성 검증 질문**(예: "6S 1200kV 15인치면 괜찮아?")은 게이트 대신 규칙 엔진이 PASS/WARN/FAIL을 직접 판정.

### 3.5 AI 드론 빌더 (`app/api/drone-builder`)

6단계: **① 기획 → ② HW 스펙 → ③ SW 스펙 → ④ 기술 스펙 → ⑤ 아키텍처 → ⑥ 코드·로드맵.**
단계마다 사용자가 승인/반려/마감하고, 반려 사유를 반영해 재생성하며, 스펙 단계는 구성요소 표·의존관계·충돌 검사를 온톨로지로 구조화한다. 최종 문서는 복사 가능.

## 4. 디렉터리 구조

```text
app/                 Next.js App Router 페이지·API
  api/chat           AI Q&A (스트리밍) · bot-chat / bot-wiki-editor (봇 JSON)
  api/drone-builder  6단계 빌더 · api/discovery, self-update (로컬 검토)
  api/graph|pages|highlights  그래프·문서·하이라이트
components/          AppSidebar, Chat, WikiArticleBody, TextSelectionPopup …
lib/                 rag · graphrag · ontology(-qa|-reason|-create|-arch) · design-gate ·
                     chat-system-prompt · ai-model · bot-model · news · wiki …
data/wiki/           공개 발행 snapshot (concepts/entities/comparisons/queries, raw, ontology, .ua)
data/ontology/       relations · instances · architecture (web 소유, 자동발행 rsync 영향 없음)
scripts/             sync-wiki.sh · build-hw-instances.py · gen-architecture.py · self-update-pipeline
docs/                Stage 0-R 문서 · 아키텍처 SVG · 감사 기록
proxy.ts             UUID 세션 쿠키 (Next.js 16 proxy 규약)
```

## 5. 기술 스택 (GitHub 언어 통계 기준: TypeScript ≈ 309KB · Python ≈ 32KB · CSS · JS · Shell)

- **프레임워크**: Next.js 16.2 · React 19.2 · Tailwind CSS 4 · react-force-graph-2d
- **AI**: Vercel AI SDK 7(`ai`, `@ai-sdk/react`, OpenAI-compatible) · NVIDIA NIM 모델 체인(헤징) → OpenRouter `:free` → 근거만 보여 주는 답, 키 풀 폴백 (상세 `docs/OPERATIONS.md`)
- **콘텐츠**: gray-matter · remark(GFM)
- **배포**: Vercel (함수 지역 `icn1`, `/api/chat` maxDuration 90s)

### 환경변수 (이름만 — 값은 저장소에 두지 않는다)

`NVIDIA_NIM_API_KEY`(쉼표로 여러 개 가능) · `NVIDIA_NIM_API_KEYS` · `OPENROUTER_API_KEYS` · `NVIDIA_NIM_BASE_URL` · `NVIDIA_NIM_MODEL` · `NVIDIA_NIM_THINKING` · `OPENROUTER_API_KEY` · `OPENROUTER_MODEL` · `LOCAL_LLM_BASE_URL` · `LOCAL_LLM_MODEL` · `BOT_API_TOKEN` · `WIKI_PATH` · `CONSENT_MODE`(strict/optional/off) · `EXP_LOG_BACKEND` · `EXP_SUPABASE_URL` · `EXP_SUPABASE_KEY`(넣기 전용) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_KEY` · `NEXT_PUBLIC_AUTH_ENABLED` · `OWNER_EMAILS` · `KG_FRESHNESS` · `KG_EVENTS` · `KG_GENERAL`

### 기능 플래그 (기본 off, 켜면 동작)

| 변수 | 기능 | 비고 |
|---|---|---|
| `KG_FRESHNESS=1` | 제품 사양표에 **수집 기준일**·경과일 행, 90일 초과 시 재확인 문구. 낡은 값을 단정하지 않도록 모델 규칙 1항 추가(제품 신선도 속성이 있을 때만) | 판정은 질의 시점 계산. DB·그래프 변경 없음 |
| `KG_EVENTS=1` | **관련 최신 동향 패널**(뉴스·영상, 미검증). 모델에는 전달하지 않고 UI 메타데이터로만 노출 | 데이터 `data/ontology/events.json`(`scripts/build-events.py`, 제목·URL·출처·날짜만) |
| `KG_GENERAL=1` | **라벨된 일반 공학 설명**(원인형 질문 한정, 본문과 분리된 점선 블록, "근거 아님" 상시 표시) | 안전·법규·제품·수치·화재 질문 차단, 코드 검증, 서버 재판정. 설계 `docs/ai-qa-improvement-plan.md` |
| `KG_LAW_EVENTS=1` | **법령 개정 알림**(동향 패널 안 "⚖ 법령" 항목, 미검증·법적 자문 아님 고지). 질문에 확정 법령명·주제어가 있을 때만 최대 3건, 모델에는 전달하지 않음 | 마스터 확정 6건 `data/ontology/laws.json`(`confirmed=true`) + `events.json` 법령 이벤트(2nd `fetch-law.py` 법제처 오픈API 수집). `KG_EVENTS`와 독립. 설계 `docs/dikw-dynamic-ontology-design.md` §15 |

네 플래그 모두 끄면 이전 동작과 완전히 같다. 롤백은 환경변수 제거 후 재배포.

### 로컬 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드
```

> 로컬 dev 서버를 상시 켜 두면 `data/wiki`를 오염시켜 자동발행 gate를 막을 수 있다 — 테스트 후에는 끈다.

## 6. 릴리즈 이력 (GitHub Releases)

| 버전 | 일자 | 내용 |
|---|---|---|
| v2.17.1 | 2026-10-30 | **법령 개정 알림을 '그래프에 없음'(근거 부족) 즉시 응답에도 표시**(`KG_LAW_EVENTS`). 스트리밍 답변과 같은 공통 조각 `lawPanelMeta`를 써서 두 경로가 갈라지지 않으며, 메타데이터 전용이라 답변 문구·모델 입력은 불변. 상세는 [설계서 §15.5](docs/dikw-dynamic-ontology-design.md) |
| v2.17.0 | 2026-10-30 | **법령 개정 알림 패널**(`KG_LAW_EVENTS`): 법제처 오픈API로 확정 법령 6건(항공안전법 3종·항공사업법·드론법·군사기지법)의 개정·시행 정보를 이벤트로 적재, 질문이 해당 법령을 언급하면 동향 패널에만 표시(답변 근거·모델 입력 불변). 동향 이벤트 재생성. 상세는 [RELEASES.md](docs/RELEASES.md)·[설계서 §15](docs/dikw-dynamic-ontology-design.md) |
| v2.16.0 | 2026-10-27 | **한국어 활용형 오판 거절 수정**(질문 36개 거절 18→6), 수집 기준일·신선도(`KG_FRESHNESS`), 동향 이벤트 패널(`KG_EVENTS`), 라벨된 일반 공학 설명(`KG_GENERAL`, 원인형 한정). 상세는 [RELEASES.md](docs/RELEASES.md)·[AI Q&A 개선 계획](docs/ai-qa-improvement-plan.md) |
| deploy-20261025-* | 2026-10-25 | 빌더 단계 일관성 검출·확정 스펙 구역·재작성 트리거, 수집 동의 고지(strict)·90일 경험 로그, 구글 로그인·내 기록(UI 숨김). 상세는 [RELEASES.md](docs/RELEASES.md) |
| deploy-20261024-* | 2026-10-24 | 배선도·단계별 이미지, 안내 카드, 키 풀 폴백, 클라우드 점검, discovery 전체 승격(문서 909→3,261). 배포마다 태그 `deploy-YYYYMMDD-HHMM`, 상세는 [RELEASES.md](docs/RELEASES.md) |
| v2.13.0 | 2026-10-17 | 온톨로지 추론 엔진 · 제품 개체 지식그래프 · 기본구조 온톨로지 · 설계 게이트 · 드론 빌더 6단계 |
| v2.10.0 | 2026-10-09 | 텔레그램 봇 브릿지 (AI Q&A + 위키 에디터) |
| v2.9.0 / v2.8.0 | 2026-09-03 | RAG 검색 범위 확장 / 도메인 다양성 |
| v2.7.0 | 2026-08-23 | 사이드바 정리 + 출처 클릭 노출 |
| v2.6.0 | 2026-08-20 | 온톨로지 Link + 서브섹션 추론 연결 |

## 7. 한계와 로드맵

- 자동 승격 문서는 claim이 없다. 원문 인용 검증(LLM 제안 + 코드로 원문 글자 일치 확인) 방식으로 claim을 늘리는 작업이 다음 단계다.
- 제품 개체는 694종이나 사양 항목이 비어 있는 것이 많다 → HW·SW 레지스트리 수집으로 보강 예정.
- 논문 방법론(전력 모델, BEMT 추력 추정 등)을 규칙과 연결하는 작업, 유추(analogy) 추론, 군집·통신 규칙 확장은 미구현.
- 기본구조 온톨로지의 링크·프로토콜 수치는 일반 범위이며 국내 법규(허용 대역·출력)는 판정하지 않는다.
- 규칙 임계값(경험칙)은 사용 사례 검증으로 보정 필요.
- 신규 도메인 12개(sensing-perception, navigation-gnss-denied, ros-middleware, rf-datalink-engineering 등) 승인 후 위키 반영 예정.

---

## 운영 경계 — Stage 0-R (2026-09-13 기준 기록) — Stage 0-R, 2026-09-13

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
