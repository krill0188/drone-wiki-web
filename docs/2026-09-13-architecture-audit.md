> **역사적 감사 기록:** 아래 내용은 Stage 0-R 수정 전 기준이다. 현재 sync는 audit-only이며, 예약 self-update는 canonical을 직접 쓴다. GraphRAG는 canonical+discovery를 함께 사용한다. 최신 확인·잔여 blocker는 [Stage 0-R](STAGE_0R_REBASELINE.md)을 따른다.

# drone-wiki-web 아키텍처 감사 (2026-09-13)

## 요약 (문서와 실제가 가장 크게 다른 3가지)

1. **README.md가 `create-next-app` 기본 템플릿 그대로다.** 프로젝트 설명이 단 한 줄도 없다 — "다르다"가 아니라 "아예 안 적혀있다"가 정확한 상태.
2. **RAG는 TF-IDF가 아니라 실제 벡터 임베딩 기반 하이브리드 검색**이다(`lib/rag.ts`: cosine similarity + 키워드 점수 가중합, `embeddings.json` 없으면 키워드 전용으로 자동 폴백).
3. **콘텐츠를 쓰는 파이프라인이 3개인데 문서엔 하나도 구분돼 있지 않다**: ①2nd Brain 동기화(외부에서 매일 git push+CLI 배포) ②self-update(뉴스↔기존문서 연결 제안) ③discovery-review(LLM 추출 개념 승격) — ②③은 로컬 전용이며 Vercel 프로덕션에서는 코드 자체가 동작 안 하게 막혀 있다(중요한 안전장치인데 문서화 안 됨).

## 레이어별 표

| 레이어 | 실제 동작 | README 기재 내용 | 차이/누락 |
|---|---|---|---|
| 콘텐츠 소스 | `~/2nd`(2nd Brain)가 원본. `~/.hermes/scripts/dronewiki-sync.sh`가 concepts/entities/raw/등을 `data/wiki/`로 rsync 후 `git commit && git push && npx vercel --prod --yes` 순차 실행(sync 스크립트 118~121행) | 없음 | 전체 누락. "git push만 하면 배포된다"는 예전 메모도 틀림 — CLI 배포가 스크립트 안에 명시적으로 들어있음 |
| 데이터 저장 | `data/wiki/{concepts,entities,comparisons,queries,raw}/*.md` (버전관리 대상) + `data/wiki/.ua/*.json`(embeddings.json, *-knowledge-graph.json, news-feed.json, daily-briefing.json, self-update-state.json — 캐시성 산출물, `.gitignore` 확인 필요) | 없음 | `.ua/` 히든 폴더 존재 자체가 문서 어디에도 없음. 실수로 커밋되거나 반대로 실수로 지워지기 쉬운 지점 |
| 검색(RAG) | `lib/rag.ts` — 키워드 점수 + `embeddings.json`의 코사인 유사도를 `HYBRID_VECTOR_WEIGHT`/`HYBRID_KEYWORD_WEIGHT`로 가중합. 임베딩 없으면 키워드 전용 폴백 | 없음(구두 기록은 "TF-IDF"라 적혀있었음 — 8/20 세션 노트) | "TF-IDF" 표현이 이제 부정확함. 실제로는 하이브리드 벡터+키워드 |
| 답변 생성 | `app/api/chat/route.ts` — OpenRouter 경유 `anthropic/claude-haiku-4.5` 호출, `vercel.json`에서 이 라우트만 `maxDuration: 90` | 없음 | 모델명·경유 방식(OpenRouter, Anthropic 직접 아님) 문서화 안 됨 |
| 그래프 | `lib/graphrag.ts` + `lib/ontology.ts`, `.ua/knowledge-graph.json`(canonical) vs `.ua/discovery-knowledge-graph.json`(미검증 LLM 추출분) — **완전히 별개 그래프**, `app/graph/page.tsx`에서 시각화 | 없음 | 두 그래프를 섞어 쓰면 안 된다는 원칙이 스킬 설명(`extract-relations`)에만 있고 이 저장소 문서엔 없음 |
| self-update | `lib/self-update.ts` — openwiki의 "diff 기반 no-op" 원칙 차용. `news-feed.json`의 미처리 뉴스만 골라 `ragSearch`로 관련 기존 문서를 찾아 "이 문서에 최근 소식 연결 제안"만 생성. **canonical 문서 direct write 안 함**, 로컬에서만 apply 가능 | 없음 | 04:20 cron(`ai.2nd.dronewiki-self-update`)이 제안만 만들고, 실제 반영은 `app/self-update-review/page.tsx`에서 사람이 승인해야 함 — 이 승인 단계 자체가 문서에 없음 |
| discovery-review | `lib/discovery-review.ts` — "Evidence → Canonical Memory → Discovery → Human Decision" 4계층 중 Discovery 단계를 사람이 검토해 `concepts/entities/*.md`로 실제 파일 승격. **Vercel 프로덕션에서는 절대 동작 금지가 코드에 하드코딩**(주석 명시) | 없음 | self-update와 혼동하기 쉬운 이름인데 역할이 완전히 다름(self-update=연결 제안, discovery-review=신규 승격) — 이 구분이 문서 어디에도 없음 |
| 드론빌더 | `app/ai-drone-builder/page.tsx` + `app/api/drone-builder/route.ts` | 없음 | 존재 자체가 README 미기재 |
| 배포 | `vercel.json`(framework: nextjs, buildCommand: npm run build), `.vercel/project.json`(프로젝트 링크 완료) + sync 스크립트의 `npx vercel --prod --yes` | "Deploy on Vercel" 섹션이 create-next-app 기본 안내 문구뿐 | 실제 배포는 CLI 트리거 방식이라는 프로젝트 고유 사실이 빠짐 |
| 카드뉴스 | v1.4.0에서 라우트/기능 완전 제거 확인(코드 검색 결과 없음) | (기록 자체가 README에 없음) | `lib/rag.ts:420` 주석에 "카드뉴스 GraphRAG 시각화용"이라는 죽은 문구 하나 남아있음 — 사소하지만 정리 대상 |
| Next.js 16 대응 | `middleware.ts` 그대로 사용 중(`proxy.ts` 미개명) | — | 다른 프로젝트(medic-wiki)에서 발견된 "Next16은 middleware.ts→proxy.ts 개명 필요" 패턴이 이 저장소엔 아직 적용 안 됨 — 실제 동작 영향 여부 별도 확인 필요(경고만 뜨는지 실제 미작동인지) |

## README.md 재작성 제안 (섹션별 초안)

```markdown
# DroneWiki

2nd Brain(개인 지식베이스)의 드론/AI 도메인 콘텐츠를 발행하는 공개 웹사이트.
콘텐츠 원본은 이 저장소가 아니라 ~/2nd 이며, 이 저장소는 "발행 뷰"다.

## 아키텍처 한눈에

원본(~/2nd) → dronewiki-sync.sh(매일 08:30) → data/wiki/*.md 동기화
           → git commit+push → vercel --prod 배포

## 데이터 구조

- data/wiki/{concepts,entities,comparisons,queries}/ — canonical 위키 문서(버전관리)
- data/wiki/raw/ — 원문 아카이브([원문·미검증] 라벨로 노출)
- data/wiki/.ua/ — 캐시/산출물(임베딩, 그래프, 뉴스피드) — 절대 수동 편집 금지

## 기능

| 기능 | 경로 | 실행 환경 |
|---|---|---|
| AI Q&A (하이브리드 RAG) | /chat | 프로덕션 |
| 위키 뷰어 | /wiki | 프로덕션 |
| 지식그래프 시각화 | /graph | 프로덕션 |
| 뉴스 피드 | /news | 프로덕션 |
| AI 드론빌더 | /ai-drone-builder | 프로덕션 |
| self-update 검토 | /self-update-review | **로컬 전용** |
| discovery 검토(신규 개념 승격) | /discovery-review | **로컬 전용** |
| 위키 에디터 | /wiki-editor | 로컬 권장 |

## RAG 방식

키워드 점수 + embeddings.json 코사인 유사도 하이브리드(TF-IDF 아님).
임베딩 파일 없으면 키워드 전용으로 자동 폴백.
LLM: OpenRouter 경유 anthropic/claude-haiku-4.5.

## 배포

vercel.json으로 설정되어 있으나, 실제 배포는 sync 스크립트 안의
`npx vercel --prod --yes` 호출로 트리거된다(git push만으로는 배포 안 됨).
```

## 코드 자체에서 발견한 버그/개선점

1. **`lib/rag.ts:420` 죽은 주석** — "카드뉴스 GraphRAG 시각화용" 문구, 기능은 이미 제거됨. 삭제 권장(기능 영향 없음, 문서 정확성 문제).
2. **`middleware.ts` vs Next 16 `proxy.ts`** — 다른 프로젝트에서 실제 문제가 됐던 패턴과 동일한 미개명 상태. 지금 정상 동작하는지(경고만 뜨는지, 라우팅 자체가 씹히는지) 별도 실측 필요 — 이번 감사 범위 밖이라 확인만 하고 수정은 안 함.
3. **`data/wiki/.ua/*.json`의 `.gitignore` 여부 미확인** — 캐시 산출물이 실수로 커밋되거나(레포 비대화) 반대로 `.gitignore`에 걸려 배포 서버에 안 실리는 사고 둘 다 가능한 지점. 별도 확인 권장.

## 작업 범위 안내

이 문서는 **감사 전용**이며 코드/README를 수정하지 않았다. 위 제안을 실제로 적용하려면 별도 작업(README.md 교체, rag.ts 주석 정리 등)이 필요하다.
