# DroneWiki

드론/AI/로보틱스 도메인 지식을 다루는 공개 위키 + AI Q&A 사이트.
**콘텐츠 원본은 이 저장소가 아니다.** 원본은 개인 지식베이스 [`2nd Brain`](../2nd)이며,
이 저장소는 그 지식베이스를 매일 자동으로 받아 발행하는 **"발행 뷰(publish view)"**다.

라이브: https://drone-wiki-web.vercel.app

## 아키텍처 한눈에

```
2nd Brain(~/2nd, 원본)
   │  daily-fetch(07:30) → daily-ingest(08:00, claude -p) → canonical 작성
   ▼
dronewiki-sync.sh (매일 08:30, launchd ai.2nd.sync-dronewiki)
   │  rsync: concepts/entities/comparisons/queries/raw/ontology + 그래프 3종 + 임베딩
   ▼
data/wiki/*  (이 저장소, 버전관리 대상)
   │  git commit && git push
   │  npx vercel --prod --yes   ← 배포는 이 CLI 호출이 트리거한다.
   ▼                              git push 자체는 자동배포를 유발하지 않는다(Vercel 프로젝트
Vercel 프로덕션 배포                가 git 연동이 아니라 CLI 배포 방식으로 설정돼 있음).
```

이 저장소가 콘텐츠를 "쓰는" 경로는 3개이며 실행 환경이 서로 다르다:

| 경로 | 하는 일 | 실행 환경 |
|---|---|---|
| 2nd Brain 동기화 | 외부(`~/2nd`)에서 매일 자동으로 밀어넣음 | 매일 08:30, 외부 launchd 잡 |
| self-update | 새 뉴스와 기존 문서를 연결하는 **제안만** 생성(`news-feed.json` 기반, `ragSearch`로 관련 문서 탐색). canonical 파일을 직접 쓰지 않는다 | 매일 04:20 제안 생성(로컬), 반영은 `/self-update-review`에서 사람이 승인해야 함. **Vercel 프로덕션에서는 코드가 동작하지 않도록 막혀 있다** |
| discovery-review | LLM이 raw 원문에서 추출한 미검증 개념(discovery 그래프)을 사람이 검토해 canonical `concepts/`/`entities/`로 실제 승격 | 로컬 전용. **Vercel 프로덕션에서는 코드가 동작하지 않도록 막혀 있다** |

self-update와 discovery-review는 이름이 비슷해 혼동하기 쉽지만 역할이 다르다 —
**self-update = "이미 있는 문서에 최신 소식 연결 제안"**, **discovery-review = "완전히 새로운 개념을 문서로 승격"**.
둘 다 사람의 승인 없이는 canonical 데이터에 영향을 주지 않으며, 프로덕션 환경에서는 애초에 실행 자체가 차단된다(안전장치가 코드에 하드코딩돼 있음).

## 데이터 구조

```
data/wiki/
├── concepts/       canonical 위키 문서(버전관리)
├── entities/       canonical 위키 문서(버전관리)
├── comparisons/    canonical 위키 문서(버전관리)
├── queries/        canonical 위키 문서(버전관리)
├── raw/            원문 아카이브 — UI에 [원문·미검증] 라벨로 노출, 원본 URL 링크
└── .ua/            산출물 캐시(버전관리, git에 커밋됨 — 실수 아님, 배포 서버가 빌드 시점에
                     이 파일들을 그대로 읽으므로 의도적으로 추적한다)
    ├── embeddings.json               문서 벡터(RAG용)
    ├── knowledge-graph.json          canonical 그래프
    ├── discovery-knowledge-graph.json  미검증 LLM 추출 그래프 — canonical과 절대 섞지 말 것
    ├── news-feed.json                뉴스 피드 원본
    └── daily-briefing.json           아침 브리핑 원본(dronewikibot 발송용)
```

## 기능

| 기능 | 경로 | 실행 환경 |
|---|---|---|
| AI Q&A (하이브리드 RAG) | `/chat` | 프로덕션 |
| 위키 뷰어 | `/wiki` | 프로덕션 |
| 지식그래프 시각화 | `/graph` | 프로덕션 |
| 뉴스 피드 | `/news` | 프로덕션 |
| AI 드론빌더 | `/ai-drone-builder` | 프로덕션 |
| self-update 검토 | `/self-update-review` | **로컬 전용** |
| discovery 검토(신규 개념 승격) | `/discovery-review` | **로컬 전용** |
| 위키 에디터 | `/wiki-editor` | 로컬 권장 |

## AI Q&A / RAG 방식

- **검색**: `lib/rag.ts` — 키워드 점수 + `embeddings.json` 코사인 유사도의 하이브리드 가중합(`HYBRID_VECTOR_WEIGHT`/`HYBRID_KEYWORD_WEIGHT`). ~~TF-IDF~~가 아니다. `embeddings.json`이 없으면 키워드 전용으로 자동 폴백한다.
- **그래프 확장**: `lib/graphrag.ts` + `lib/ontology.ts` — canonical 그래프(`knowledge-graph.json`)만 사용한다. discovery 그래프는 미검증 상태라 답변 근거로 쓰지 않는다.
- **답변 생성**: `app/api/chat/route.ts`, OpenRouter 경유 `anthropic/claude-haiku-4.5` 호출. Anthropic API를 직접 호출하지 않는다.
- 답변에는 원본 문서의 frontmatter/Link 데이터가 실제로 포함된다(2026-08-20 수정, 현재도 정상 동작 확인됨).

## 배포

- `vercel.json`(framework: nextjs)으로 설정돼 있지만, **git push만으로는 재배포되지 않는다.**
- 실제 배포는 `dronewiki-sync.sh` 안의 `npx vercel --prod --yes` 호출이 트리거한다(매일 08:30 동기화 직후).
- 로컬에서 급하게 재배포하려면 저장소 루트에서 `vercel --prod` 를 직접 실행한다.

## 알려진 이슈 / 다음 확인 사항

- `middleware.ts`가 Next.js 16의 `proxy.ts` 개명 규칙을 아직 반영하지 않았다 — 실제 동작 영향(경고만인지, 라우팅이 실제로 씹히는지)은 별도 확인 필요.
- `ai.2nd.medic-wiki-fetch`(별도 프로젝트 `~/medic-wiki`의 수집 잡)가 이 사이트와 무관하게 2nd Brain과 같은 launchd 스케줄러 위에서 함께 실행된다 — 이 저장소 콘텐츠에는 영향 없음, 참고용.

---
*이 문서는 2026-09-13 실제 코드/launchd 설정 기준 감사 후 작성됨. 감사 원본: [`docs/2026-09-13-architecture-audit.md`](docs/2026-09-13-architecture-audit.md)*
