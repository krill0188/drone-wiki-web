# DroneWiki 운영 런북 (2026-10-23)

답변은 온톨로지·지식그래프·출처 확인 위키에서만 나오고, 모델(NVIDIA NIM)은 표현만 한다. 운영 중 문제가 생기면 아래 순서로 본다.

## 1. 한눈에 보는 구조
- 진실의 원천: `~/2nd`(Markdown, Git). 웹은 발행 게이트를 통과한 스냅샷만 `data/wiki`로 받는다.
- 지식 DB: `data/knowledge/knowledge.sql`(결정론 생성) → 서버 시작 시 메모리 SQLite에 적재(0.4초).
- 질의: `lib/kg-plan.ts`(판정) → `kg-context.ts`(근거) → 모델 → 후처리 스트림(`soften` 표기 통일 → `citationGuard` 허위 인용 제거 → `prefixInjector` 서버 사양표 → `inferenceGuard` 추론 문단 검사) → `kg-verify.ts`(사후 검증).
- 모델 배정: `lib/model-tier.ts`(fast=chat 체인 lightning 우선, deep=builder 체인 ultra 우선), `lib/ai-model.ts`(체인 폴백 + 병렬 헤징).

## 2. 환경변수 (Vercel production, 배포 시점에 묶임 → 바꾸면 재배포)
| 변수 | 값 | 끄는 법 |
|---|---|---|
| `KG_BACKEND` | `sqlite` | 삭제 → 이전 json 경로 |
| `KG_TIER` | `auto` (기본 fast, `KG_DEEP=on`일 때만 비교·설계 질문이 deep) | 삭제 → 전부 deep |
| `KG_DEEP` | 미설정(권장). `on`이면 비교·설계 질문을 큰 모델로 보냄 — 2026-10-24 점검에서 120초 시간 초과 1건이 deep에서 나와 기본 끔 | — |
| `BUILDER_TIER` | `cascade` (초안 chat 체인, 검증 위반 시 builder 체인) | 삭제 → 전부 builder 체인 |
| `NVIDIA_NIM_CHAIN` / `NVIDIA_NIM_BUILDER_CHAIN` | 쉼표 구분 모델 id(선택) | 삭제 → 코드 기본 체인 |
| `NVIDIA_NIM_HEDGE_CHAT_MS` / `NVIDIA_NIM_HEDGE_BUILDER_MS` | 기본 4000 / 12000 | 매우 큰 값으로 두면 헤징 사실상 끔 |
| `NVIDIA_NIM_FIRST_CONTENT_MS` | 기본 15000 | — |
| `BUILDER_REASON` | `on`이면 빌더 SW·기술스펙·아키텍처 단계에 교차 공학 추론 블록·지식그래프 근거를 넣고, 생성 뒤 추론 모델(reason 체인: minimax-m3.1-flash → nemotron-3-ultra 추론켬 → glm-5.3-flash)이 🔮 가정·불확실성을 짧게 검토. **기본 꺼짐**(요청 body `reason:"on"`으로 측정만 가능) | 삭제 → 꺼짐 |
| `NVIDIA_NIM_REASON_CHAIN` / `NVIDIA_NIM_HEDGE_REASON_MS` | 추론 체인·헤징(기본 9000) | 삭제 → 기본 |
| `OPENROUTER_API_KEY` | NIM 체인 소진 시 OpenRouter `:free`(nemotron-3-ultra → lightning → openrouter/free)로 자동 폴백. 계정 공통 한도 분당 20회·크레딧 없으면 일 50회 | 키 삭제 → 폴백 없음(바로 근거만 답변) |
키 값은 문서·로그에 적지 않는다(`vercel env ls`는 이름만 본다).

## 3. 정기 점검
- 클라우드 이중화(준비됨, 미가동): `docs/ops/ops-eval.workflow.yml`을 `.github/workflows/ops-eval.yml`로 옮겨 푸시하면 GitHub Actions가 매일 08:00(KST) 질문 25문항, 매주 월요일 09:00 설계 도우미 6단계를 점검하고 실패 시 소유자에게 알림 메일을 보낸다. 푸시에는 gh 토큰의 `workflow` 권한이 필요하다(`gh auth refresh -h github.com -s workflow`, 사용자가 브라우저로 승인).
- 설계 도우미 회귀: `npm run eval:builder`(약 8~10분, 6단계 + 반려→재작성, ❌ 6건 초과·단계 240초 초과·빈 단계면 종료코드 1).
- 자동: launchd `ai.dronewiki.eval`이 매일 07:40에 `scripts/ops-eval.sh` 실행 → `~/projectm/drone-wiki-ops/history.jsonl`에 한 줄씩 쌓고, 실패하면 macOS 알림.
- 수동: `npm run eval:prod` (25문항, 22/25 미만 또는 p90 40초 초과면 종료코드 1) / `curl https://drone-wiki-web.vercel.app/api/health`.
- 정상 기준(2026-10-22~23 측정): 25/25, p50 약 6초, p90 약 20~30초, 검증 경고 0~1건, 법령 질문 0.2초.
- 이력 보기: `tail -5 ~/projectm/drone-wiki-ops/history.jsonl`. 연속 이틀 p90 40초 초과 또는 정답 하락이면 아래 §5.

## 4. 배포 절차 (공유 폴더에서 배포하지 않는다)
1. 변경은 깨끗한 `git worktree`(origin/main 기준)에서 한다. `.vercel`을 복사해 둔다. 공유 폴더 `~/projectm/drone-wiki-web`는 다른 계정도 편집한다.
2. `npx tsc --noEmit`, `KG_BACKEND=sqlite npx tsx scripts/test-kg-answer.ts`(36건), `npm run test:hedge`(4건), `~/2nd/.venv/bin/python scripts/test_knowledge_db.py`, `scripts/build-knowledge-db.py --verify`.
3. 커밋 → `git push origin HEAD:main` → `vercel --prod --yes`(약 10분). 빌드 45분 한도에 주의(`getAllPages` 캐시가 핵심).
4. 배포 후 `curl /api/health` → `npm run eval:prod`. 위키가 바뀐 배포면 `~/2nd`에서 `rebaseline-publication.py --apply` 후 커밋·푸시.
5. 위키 갱신 흐름: lint → `approve-held.py --apply` → policy 커밋 → `approve-version-manifest.py --apply` → 커밋 → discovery 미처리 0까지 `extract-knowledge-graph.sh --limit 15` 반복 → `knowledge-pipeline.py --refresh-derived --candidate <경로>` → web `rsync -ac --delete`.

## 4-1. 모델 장애 시 단계 (자동)
1. NIM 체인(헤징 포함) → 2. OpenRouter `:free` 같은 계열 모델 → 3. **모델 없는 근거 답변**(서버 사양표·검증 claim·관계·위키 발췌, "AI 해설 모델이 일시적으로 응답하지 않아…" 안내). 2·3단계 사용 여부는 Vercel 로그(`OpenRouter 폴백 사용`, `모든 모델 실패 → 근거만 표시`)와 `/api/health`의 `fallbackUsed`로 본다. 폴백 경로 점검은 `/api/health?probe=openrouter`(결과 10분 캐시, 매일 ops-eval이 호출).

## 5. 장애 대응
| 증상 | 먼저 볼 것 | 조치 |
|---|---|---|
| 답변이 매우 느림(p90 40초↑) | Vercel 로그 `[ai-model] ttfc model=… ms=…` | 한 모델만 느리면 `NVIDIA_NIM_CHAIN`에서 순서 변경(재배포). 헤징 시간(`HEDGE_*`)을 줄인다. NIM 전반 부하면 대기. |
| 빈 응답·"모든 AI 모델이 응답하지 않았습니다" | 같은 로그의 `no answer / error → next` | 체인 모델이 퇴역(404)했는지 `curl`로 확인 후 체인 교체. |
| `/api/health` 503 | `error` 필드 | `data/knowledge/knowledge.sql` 누락·손상 → `build-knowledge-db.py` 재생성 후 재배포. |
| 정상 질문이 거절됨 | `planQuery`의 `limitations` | 질문 속 문체·관점 단어가 핵심어로 오인된 것이면 `GENERIC_Q`/`ASPECT_Q`/`REQUEST_WORD`(kg-plan.ts)에 추가하고 시험 W1c에 사례 추가. |
| "검증 경고" 증가 | `verification.violations` | `unsupported_number`는 모델이 근거 밖 숫자를 쓴 것(정상 동작). 반올림·단위 환산은 허용됨. `unknown_id`는 citationGuard가 제거. 급증하면 프롬프트 규칙(kg-context.ts)과 모델 체인을 의심. |
| 빌더가 빈 단계·시간 초과 | 응답 길이 0, 진행 이벤트 | `BUILDER_TIER` 켜져 있는지 확인(cascade). ultra 과부하 시 큰 모델 우선 구조는 실패율이 높다. |
| 배포 실패 "Unexpected error" | `vercel inspect <url> --logs`의 Duration | 45분이면 빌드 한도 초과. 정적 페이지 수·`getAllPages` 확인. |
| 되돌려야 함 | `vercel ls` | 직전 Ready 배포를 `vercel promote <url>` 또는 롤백. 환경변수 기능은 변수 삭제 후 재배포. |

## 6. 지키는 원칙 (바꾸지 않는다)
- 6단계 빌더 구조와 `/api/drone-builder` 형식 불변. 개편은 서버 근거 주입만.
- 공개 게이트 HARD_DENY(career-quiz, raw/papers/files) 완화 금지. 논문 PDF 비공개.
- 기존 `domain`을 자동 변경·추론하지 않는다. 새 도메인·클래스는 제안으로만.
- discovery 그래프는 사실 근거가 아니다. 위키 요약 claim은 `sourced`가 상한.
- 근거가 없으면 "재확인 필요"로 쓴다("미확인" 표기는 쓰지 않는다). 추론은 🔮 문단에 등급(가능성 낮음·중간·높음)으로만, 사실이 아님을 밝히고 새 숫자·법령·안전 값에는 쓰지 않는다.
- 비밀값(키·토큰)은 문서·로그·응답에 쓰지 않는다.
