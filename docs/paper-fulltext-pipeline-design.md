# 논문 전문(全文) 파이프라인 일일 편입 설계서

> 작성: 2026-10-27 · 상태: **설계 초안(승인 전)** · 코드·데이터·launchd는 이 문서 작성 중 수정하지 않았습니다.
> 근거 표기: **VERIFIED**(이번 세션에 파일·DB·코드로 직접 확인) / **INFERRED**(코드에서 도출, 미실행) / **UNKNOWN**(근거 부족).
> 선행 문서: `docs/dikw-dynamic-ontology-design.md` §14(논문 수집·그래프 경로 점검).

---

## 0. 한 장 요약

| 항목 | 내용 |
|---|---|
| 문제 | 매일 수집되는 논문은 **초록만** 지식그래프의 근거가 된다. 전문에서 뽑은 검증 claim은 수동 파이프라인으로 만든 **105편**뿐이고, 일일 수집 논문 대부분은 전문 처리를 한 번도 거치지 않았다. |
| 해법 | 기존 `pipeline.py`의 **"AI는 후보 작성, 판정은 코드"** 원칙을 그대로 두고, 일일 파이프라인에 `Generate:paper-fulltext` 단계를 추가한다: 원문 확보 → 텍스트 추출 → 후보 claim 생성 → 코드 판정 → **대기열(pending)에 적재**. |
| 핵심 안전장치 | 판정 규칙(원문에 인용문이 글자 그대로 존재 + 값의 숫자가 인용문 안에 존재)은 **변경하지 않는다.** 통과분은 웹 온톨로지(`paper-claims.json`)에 **자동 병합하지 않고** 사람 승인을 거친다. |
| 선결 문제 | ① 원문이 있는 노트가 26%뿐 ② 추출 도구(PyMuPDF)가 일일 파이프라인 환경에 없음 ③ 후보 작성 단계가 현재 수동 |
| 규모 | 미처리 논문 백로그 약 190편(§2). 일일 상한을 두고 점진 처리 |
| 결정 필요 | §9 (D5~D8) |

---

## 1. 목적

지식그래프의 사실 근거 중 가장 신뢰도가 높은 것은 "원문 PDF와 글자 단위로 대조된 claim"(`pdf-quote-match`)이다. 이 경로가 수동이라 근거의 폭이 105편에서 멈춰 있다. 논문 수집은 이미 매일 자동인데 **수집한 논문이 근거로 승격되는 길이 없는 것**이 병목이다.

원칙(유지): *Evidence → Canonical Memory → Discovery → Human Decision* 4계층. 자동 생성물은 사람 검토 전까지 Discovery 층에 머문다.

---

## 2. 현황 실측 (VERIFIED)

### 2.1 논문 노트와 원문 연결 상태

`~/2nd/raw/papers/**/*.md` 297개를 프런트매터로 분류했다.

| 구분 | 노트 수 | 원문(PDF/HTML)이 연결·존재 |
|---|---|---|
| Zotero 경유 노트(`zotero_key` 보유) | 266 | **76건만** `attachment_path` 보유·파일 존재, 190건은 원문 없음 |
| `fetch-inbox.sh` arXiv 노트(`source` 보유) | 18 | 연결 필드 없음(원문은 `raw/papers/files/<도메인>/<슬러그>.{html,pdf}`에 보존되나 노트와 직접 연결되지 않음) |
| 기타 형식 | 13 | 미분류 |
| **합계** | **297** | **원문 연결 76건 = 26%** |

디스크에는 `raw/papers/files/`에 원문 130개(PDF 83 + HTML 47)가 있으나 노트에 연결된 것은 76건이라 **54개는 연결되지 않은 원문**이다(HTML/PDF 이중 보존, 슬러그 불일치 등 원인은 미조사, **UNKNOWN**).

> **정정:** `dikw-dynamic-ontology-design.md` §14에 쓴 "원문 보존 약 44%"는 디스크 파일 수(130)를 노트 수로 나눈 근사였고, 노트 기준으로는 **26%**가 정확하다.

### 2.2 기존 전문 파이프라인(수동)

위치: `~/projectm/hw-collection/20261019/papers-ontology/pipeline.py`

| 단계 | 현재 구현 | 비고 |
|---|---|---|
| `totxt` | PyMuPDF(`fitz`)로 `pdf/*.pdf` → `txt/*.txt` | **PDF만 지원. `fitz`가 시스템 python과 `~/2nd/.venv` 어디에도 설치돼 있지 않음** |
| 후보 claim 작성 | `claims/<arXiv>.json` — **사람/Claude 세션이 수동 작성** | 자동 호출 코드 없음 |
| `verify` | `check()`가 코드로 판정 | 아래 규칙 |
| `merge` | 통과분을 웹 `paper-claims.json` 형식으로 병합, `evidenceKind`는 정규식으로 판정 | 수동 실행 |

판정 규칙(`check()`, VERIFIED):
1. `quote`(공백·합자·유니코드 대시 정규화 후)가 원문 텍스트에 그대로 존재, 길이 15~400자
2. `value`의 모든 숫자가 `quote` 안에 존재
3. `subject·attribute·conditions·locator·value`가 비어 있으면 탈락(조건 없는 일반화 금지)

규모: PDF 178 · txt 178 · claim 파일 480개(후보/통과/탈락) · 통과 claim → `paper-claims.json`(10/21 병합). 운영 DB 기준 `pdf-quote-match` 검증 claim **253건 / 109편**. 이 178편은 하드웨어 도메인 후보(`candidates_A/B/C`)를 별도 수집한 집합이고 `~/2nd/raw/papers`의 arXiv 노트와 겹치는 것은 **8편뿐**이다(arXiv ID 기준, 144개 중).

### 2.3 일일 파이프라인 구조

`~/2nd/scripts/knowledge-pipeline.py` `steps()` (VERIFIED):

```
Generate:fetch → ingest → self-update-canonical → kinetic-apply
→ Validate:canonical-lint-before-generation
→ Generate:embeddings → Generate:discovery(--limit 40) → Generate:canonical-graph
→ Validate:all (publication-preflight)
```

- 단계별 타임아웃 7,200초, 실패 시 고정 진단 코드만 기록(`STEP_TIMEOUT`, `STEP_FAILED` 등), 소스·제공자 출력은 저장하지 않음.
- 쓰기 단일화 잠금(`with-pipeline-lock.py`)을 상속.
- 현재 `Generate:discovery`가 **하루 40건 상한**으로 LLM 추출을 도는 선례가 있다(같은 방식으로 상한을 둔다).
- 마지막 실행(10/25)은 `Validate:all`의 `publication-policy`에서 exit 2로 멈춤 → 배포는 승인 대기.

### 2.4 LLM 호출 경로 (VERIFIED)

- `~/projectm/scripts/ai_router.py`: 저가치·대량 작업은 codex-lb → NVIDIA 카탈로그(`openai/gpt-oss-20b`, `nvidia/nemotron-3.5-lightning-30b-a3b`) → 폴백 순. 키는 `~/projectm/.secrets.env`(값 비노출).
- `extract-abstract-claims.py`(초록 claim)는 NIM을 직접 호출하고 키는 웹 `.env.local`의 `NVIDIA_NIM_API_KEY`를 읽는다. **두 가지 키 경로가 공존**한다.
- 초록 claim은 "모델 제안 → 코드가 인용문 일치·값 존재 확인 → 별도 판정 호출(JUDGE)"의 3단 구조로 이미 자동화되어 있다. 전문 경로도 같은 3단 구조를 재사용할 수 있다.

---

## 3. 목표와 비목표

**목표**

- G1. 일일 수집 논문(원문이 확보된 것)에서 **전문 기반 검증 claim 후보**가 매일 자동으로 대기열에 쌓인다.
- G2. 판정은 기존과 **동일한 규칙**으로 코드가 한다. 모델 출력을 신뢰하지 않는다.
- G3. 실패·한도 초과·모델 장애가 일일 파이프라인 전체를 멈추지 않는다.
- G4. 원문 미보존 논문을 자동 재시도해 원문 연결률을 높인다.

**비목표(이번 범위 밖)**

- 통과 claim의 **자동 승격**(웹 `paper-claims.json` 자동 병합). 사람 승인 단계를 둔다.
- 전문 청킹 임베딩(벡터 검색 개선) — `dikw-dynamic-ontology-design.md` Phase 3에서 다룬다.
- 표·그림 속 수치 추출(텍스트 추출이 불안정). 본문 텍스트의 서술형 수치만 대상.
- 유료 API 사용. 기존 무료·구독 경로 안에서만.

---

## 4. 설계

### 4.1 새 단계의 위치와 이름

```
Generate:fetch → Generate:ingest
→ Generate:paper-fulltext   ← 신규(이 문서)
→ Generate:self-update-canonical → … (기존 그대로)
```

- `fetch`가 새 논문·원문을 가져온 **직후**, 그리고 canonical을 건드리는 단계 **이전**에 둔다. 이 단계는 canonical 위키를 **읽기만** 하고 `.ua/` 파생 영역에만 쓴다 → 후속 단계·lint에 영향이 없다.
- **soft 단계**: 실패해도 파이프라인을 중단하지 않고 진단 코드만 기록(`PAPER_FULLTEXT_FAILED` 등)한 뒤 계속한다. 기존 단계 중 이 성격은 없으므로 `run_steps`에 `soft` 속성을 추가해야 한다(**기존 코드 수정 필요 지점**).

### 4.2 내부 단계 (`scripts/paper-fulltext.py`, 신규)

| # | 단계 | 입력 → 출력 | 비고 |
|---|---|---|---|
| P1 | **원문 확보** | 원문이 연결되지 않은 arXiv 논문 → `raw/papers/files/…` | 하루 최대 `--fetch-limit`건 재시도, HTML 우선·PDF 폴백(`preserve_original()` 재사용). 연결 필드를 노트에 쓰는 것은 **이 단계에서 하지 않는다**(canonical·raw 수정 금지) — 연결표는 `.ua/paper-index.json`에 별도 기록 |
| P2 | **텍스트 추출** | PDF/HTML → `.ua/papers-text/<id>.txt` | PDF: PyMuPDF. HTML: 표준 라이브러리 `html.parser`로 본문 태그만(수식·참고문헌 제외). 추출 결과의 해시를 기록해 멱등성 보장 |
| P3 | **후보 claim 생성** | txt → `.ua/papers-claims/<id>.json`(후보) | 본문을 **절 단위로 분할**해 모델에 전달(초록·서론·결론 제외 옵션). 출력 스키마는 기존 `claims/<id>.json`과 동일. 하루 `--limit`편 상한 |
| P4 | **코드 판정** | 후보 + txt → `*.verified.json` / `*.rejected.json` | `pipeline.py`의 `check()`를 **그대로 가져온 모듈**로 판정 |
| P5 | **대기열 적재** | verified → `.ua/paper-claims-pending.json` | 웹 `paper-claims.json`과 같은 스키마 + `reviewStatus: "pending"`. 병합은 §4.5 |

모든 산출물은 `~/2nd/.ua/` 아래(이미 `.gitignore` 대상 파생 영역). raw·canonical·웹 레포는 이 단계가 **수정하지 않는다**.

### 4.3 코드 구조 — 판정 로직 이전

`pipeline.py`의 `norm`·`nums`·`check`·`evidence_kind`는 일회성 작업 폴더(`hw-collection/20261019/…`)에 있다. 일일 파이프라인이 날짜가 박힌 임시 작업 폴더에 의존하면 안 되므로:

- 해당 함수를 `~/2nd/scripts/paper_claims_lib.py`로 **복사 이전**(동작 변경 없음)하고, 기존 `pipeline.py`는 이 모듈을 import하도록 바꾸거나 그대로 둔다(결정은 구현 시).
- **회귀 보증**: 기존 `claims/*.json` 480개 파일을 새 모듈로 다시 판정해 `*.verified/rejected.json`과 **100% 같은 결과**가 나와야 한다(§7 T1). 같지 않으면 이전 중단.

### 4.4 후보 생성 프롬프트와 모델

- 기존 초록 claim의 3단 구조를 재사용: ① 후보 작성(모델) → ② 코드 판정(`check()`) → ③ 별도 판정 호출(JUDGE, "대상·속성·값을 인용문이 직접·유일하게 말하는가 OK/NO").
- 전문은 초록보다 길고 수치 문장이 많아 **인용문이 모호한 경우가 많다** → ③ JUDGE를 유지한다(초록 경로에서 오탐을 줄인 장치).
- 모델 경로는 §9 D6. 어떤 경로든 **모델 출력은 후보일 뿐**이며 통과 여부는 항상 코드가 결정한다.

### 4.5 승인과 병합(사람 관문)

- 적재 위치는 `.ua/paper-claims-pending.json`. 웹 `data/ontology/paper-claims.json`은 **자동 수정하지 않는다.**
- 승인 절차(권고, D7): 주 1회 대기열 요약 리포트(논문별 통과/탈락 수, 샘플 claim 10건의 인용문·값)를 텔레그램으로 보내고, 마스터가 승인한 묶음만 `merge`로 웹 레포에 반영 → 기존 배포 절차(`deploy-prod.sh`, 발행 게이트)로 나간다.
- `evidenceKind`(reported / model-assumption / simulation / cited-secondary)는 기존 `evidence_kind()` 정규식을 그대로 사용 → 기존 `ANSWER_CONSTRAINTS`("model-assumption·simulation·cited-secondary는 실측이 아님을 밝힐 것")가 그대로 작동한다.

### 4.6 일일 실행 제어

| 장치 | 내용 |
|---|---|
| 일일 상한 | `--limit N`편(권고 5, D5), `--fetch-limit M`건(권고 10). `Generate:discovery --limit 40`의 선례 |
| 상태 파일 | `.ua/paper-fulltext-state.json`: 논문별 `{원문해시, txt해시, 단계, 시도횟수, 마지막 오류코드}`. 입력 해시가 같으면 건너뛰어 **멱등** |
| 재시도 한도 | 논문당 3회 실패 시 `quarantine`(자동 재시도 중단, 리포트에만 노출) — 같은 작업 반복 실패 3회 중단 원칙과 일치 |
| 타임아웃 | 단계 전체에 별도 상한(권고 40분). 상한에 닿으면 정상 종료하고 남은 편은 다음 날로 |
| 잠금 | 기존 `with-pipeline-lock.py` 상속(다른 쓰기 단계와 동시 실행 금지) |
| 로그 | 고정 진단 코드만 기록. 논문 본문·모델 응답·키는 로그에 남기지 않음 |
| 비밀 | 키는 기존 경로(`.secrets.env`/`.env.local`)에서 읽기만, 출력·저장 금지 |

### 4.7 원문 미보존 논문 처리 (G4)

Zotero 경유 노트 190건은 원문이 없다. 이 중 DOI/URL이 arXiv를 가리키는 것은 P1에서 재시도 대상이 된다(arXiv `url`/`doi` 필드로 ID 추출). arXiv가 아닌 저널 논문은 **자동 수집하지 않는다**(저작권·접근 제한; KCI는 `원문 공개` 여부가 이미 기록됨). 백로그 크기 산정은 §5.

---

## 5. 백로그와 처리 시간 (실측 + 가정)

| 항목 | 값 | 근거 |
|---|---|---|
| 전체 논문 노트 | 297 | VERIFIED |
| 원문이 연결·존재 | 76 | VERIFIED |
| 전문 claim이 이미 있는 논문(운영 DB 기준) | 109 | VERIFIED(이 중 raw 노트와 겹치는 것은 소수 — 별도 집합) |
| arXiv ID를 가진 raw 노트 | 144 중 전문 claim 보유 8 → **미처리 약 136편** | 4~5자리 패턴 기준 근사, 형식이 다른 ID는 누락 가능 |
| 처리 시간 | **UNKNOWN** | 논문당 모델 호출 횟수·응답 시간 미측정 → 파일럿에서 실측 |

일일 5편이면 약 4주에 백로그가 소진된다(신규 유입이 하루 몇 편인지는 미측정, **UNKNOWN**). 파일럿(§8 Phase A) 후 상한을 재조정한다.

---

## 6. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R1 | 모델이 수치를 지어냄 | **코드 판정 규칙이 막는다**: 인용문이 원문에 글자 그대로 있어야 하고 값의 숫자가 인용문 안에 있어야 함. 추가로 JUDGE 단계 |
| R2 | PDF 2단 조판에서 텍스트 순서가 깨져 정상 인용문이 탈락 | 허용(거짓 탈락은 안전한 방향). 파일럿에서 탈락 사유 분포로 확인 |
| R3 | 인용문은 맞지만 **맥락상 다른 대상**의 수치(서술 모호) | JUDGE + 사람 승인 관문 + `conditions` 필수. 승인 샘플 검토에서 오승인율 측정(§7 T5) |
| R4 | 무료 모델 레이트리밋·장애 | soft 단계, 일일 상한, 상태 파일로 이어하기, 실패 시 다음 날 재개 |
| R5 | 일일 파이프라인 시간 증가(이미 7,200초 상한 단계들 존재) | 단계 자체 40분 상한. 초과분은 이월 |
| R6 | 원문 전문을 `.ua/`에 보관 → 용량 증가·저작권 | `.ua/`는 비공개·미커밋. 배포 데이터에는 인용문(≤400자)·출처만 들어감. 용량은 파일럿에서 측정 |
| R7 | `run_steps`에 soft 속성을 넣다가 기존 단계 동작 변경 | 신규 속성은 기본값 false(=기존 동작 동일). 기존 단계 목록 회귀 시험 |
| R8 | PyMuPDF 설치(환경 변경) | D8에서 승인 후 `~/2nd/.venv`에만 설치. 시스템 python은 건드리지 않음 |
| R9 | 두 가지 NIM 키 경로 혼선 | 구현 시 한 경로로 통일(ai_router 경유 권고) 또는 현행 유지를 D6에서 확정 |

---

## 7. 검증 기준 (QA 게이트)

| # | 시험 | 합격 기준 |
|---|---|---|
| T1 | **판정 회귀**: 이전한 `check()`가 기존 claim 파일 480개를 재판정 | `*.verified/rejected.json`과 **100% 동일** |
| T2 | 텍스트 추출: PDF 10편·HTML 10편 | 추출 성공률, 합자·대시 정규화 후 알려진 문장이 존재 |
| T3 | 판정 단위 시험: 인용문 없음·숫자 불일치·필드 누락·길이 경계(14/15/400/401자) | 전부 탈락/통과가 규칙대로 |
| T4 | 멱등성: 같은 입력으로 2회 실행 | 두 번째는 작업 0건, 산출물 바이트 동일 |
| T5 | **오승인 감사**: 통과 claim 30건을 무작위 추출해 사람(또는 별도 검토 세션)이 인용문↔대상·속성·값 일치 판정 | 오승인 ≤ 5%. 초과 시 JUDGE 프롬프트·규칙 보강 후 재측정 |
| T6 | 격리: 실행 전후 raw·canonical·웹 레포·`paper-claims.json` 바이트 변경 | 0건 |
| T7 | 장애 격리: 모델 호출 실패·타임아웃 주입 | 파이프라인 계속 진행, 진단 코드 기록, 상태 파일 이어하기 |
| T8 | 기존 `steps()` 회귀: soft 속성 추가 후 기존 9단계 동작 | 기존 시험 통과, 단계 순서·타임아웃·실패 처리 불변 |
| T9 | 일일 상한·시간 상한 | 상한을 넘겨 처리하지 않음 |
| T10 | 파일럿 수율 | 논문당 후보 수, 통과율, 탈락 사유 분포 보고(합격선은 파일럿 후 설정) |

공통: 변경은 플래그(`PAPER_FULLTEXT=1`, 기본 off)로 감싸고, launchd plist의 단계 목록에서 한 줄로 끄고 켤 수 있어야 한다.

---

## 8. 단계별 계획

| Phase | 내용 | 산출 | 규모 |
|---|---|---|---|
| **A. 파일럿(수동 실행)** | `paper_claims_lib.py` 이전 + T1 회귀 → 원문이 있는 논문 10편으로 P2~P4 수동 실행 → 수율·시간·탈락 분포·오승인율(T5) 측정 | 파일럿 보고서, 상한값 근거 | 중 |
| B. 단계 편입 | `paper-fulltext.py` 완성(P1~P5, 상태 파일·상한·soft) + `steps()`에 `Generate:paper-fulltext` 추가(플래그 off로 배포) + T6~T9 | 코드·시험 | 중 |
| C. 활성화 | 플래그 on, 첫 주는 상한 3편으로 관찰 → 상한 조정 | 운영 로그 | 소 |
| D. 승인 흐름 | 주간 대기열 리포트(텔레그램) + `merge` 승인 절차 | 리포트·문서 | 소 |

Phase A 결과로 B 이후의 상한·시간 가정을 확정한다. **Phase A 전에는 launchd·일일 파이프라인을 수정하지 않는다.**

---

## 9. 결정 요청

| # | 질문 | 권고 |
|---|---|---|
| **D5** | 일일 처리 상한 | 논문 5편 / 원문 재시도 10건으로 시작, 파일럿 후 조정 |
| **D6** | 후보 작성 모델 경로 | 기존 `ai_router` 저가치 티어(codex-lb → NVIDIA 무료 → 폴백). 키 경로는 한 곳으로 통일. 판정은 항상 코드 |
| **D7** | 통과 claim의 웹 반영 방식 | **자동 병합 금지.** 주 1회 대기열 리포트 → 마스터 승인 묶음만 병합 → 기존 배포 절차 |
| **D8** | `~/2nd/.venv`에 PyMuPDF 설치 | 승인 시 `.venv`에만 설치(시스템 python 불변). 대안: 외부 `pdftotext` 의존(설치 여부 미확인) |

---

## 10. 변경 예정 파일

| 위치 | 변경 |
|---|---|
| `~/2nd/scripts/paper_claims_lib.py` | 신규(판정·정규화·`evidence_kind` 이전) |
| `~/2nd/scripts/paper-fulltext.py` | 신규(P1~P5) |
| `~/2nd/scripts/knowledge-pipeline.py` | `steps()`에 단계 1줄, `run_steps`에 `soft` 속성(기본 false) |
| `~/2nd/scripts/test_paper_claims_lib.py`, `test_paper_fulltext.py` | 신규 시험 |
| `~/2nd/.venv` | PyMuPDF 설치(D8 승인 시) |
| 웹 레포 | **변경 없음**(병합은 승인 후 별도 작업) |

---

## 11. 확인하지 못한 것

- 원문 연결이 안 된 54개 파일(디스크 130 − 연결 76)의 정체와 노트 매핑.
- 형식이 다른 arXiv ID(4~5자리 패턴 밖)를 가진 노트의 정확한 수 → 백로그가 136편보다 클 수 있음.
- 논문당 모델 호출 횟수·소요 시간·무료 모델 일일 한도(파일럿에서 실측).
- 신규 유입 논문의 일일 평균(백로그 소진 속도 계산용).
- HTML 원문(arXiv LaTeXML)의 텍스트 추출 품질 — 수식·표 처리.
- 기존 `pipeline.py` 통과 claim의 오승인율(기존 253건의 사후 감사 이력 없음).
