# 제품·뉴스 문서 온톨로지 클래스 분류 제안서 (2026-10-24, 승인 전)

> 이 문서는 제안서이며 위키 문서, 온톨로지, DB 파일을 수정하지 않았습니다. 수치는 `data/knowledge/knowledge.sql`(문서 903쪽), `data/ontology/graph.json`(제품 694개), `~/2nd/.ua/news-feed.json`을 읽기 전용으로 직접 센 값입니다. 모델 API는 호출하지 않았습니다. "추정"으로 표시한 값만 규칙 기반 추정입니다.

## 1. 실측 현황

### 1.1 전체 기준

| 구분 | 문서 수 | 클래스 있음 | 클래스 없음 | 없음 비율 |
|---|---|---|---|---|
| 전체 | 903 | 263 | 640 | 70.9% |
| concept | 841 | 241 | 600 | 71.3% |
| entity | 56 | 22 | 34 | 60.7% |
| comparison | 4 | 0 | 4 | 100% |
| query | 2 | 0 | 2 | 100% |

### 1.2 제품 계열

제품은 두 층으로 존재합니다. KG 제품 노드(694개)는 전부 클래스를 가지지만, 위키 문서 층의 제품 관련 문서는 절반 가까이 비어 있습니다.

| 층 | 대상 | 개수 | 클래스 있음 | 클래스 없음 | 비고 |
|---|---|---|---|---|---|
| KG 제품 노드 | graph.json `Product` | 694 | 694 | 0 | 12개 부품 클래스에 isA로 연결됨 |
| 위키 문서 | domain=hardware | 170 | 78 | 92 (54.1%) | |
| 위키 문서 | domain=vendor-registry | 18 | 0 | 18 (100%) | `concepts/vendor-registry-*` 16건 + 2건 |
| 위키 문서 | `*-specs-catalog` 계열 | 7 | 7 | 0 | 이미 부품 클래스(Motor 등) 연결됨 |

KG 제품 694개의 클래스별 분포(직접 집계)

| Motor | GNSS | Propeller | Battery | Frame | ESC | Engine | Datalink | Sensor | FlightController | CompanionComputer | Payload |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 163 | 106 | 88 | 82 | 70 | 56 | 30 | 26 | 22 | 19 | 17 | 16 |

KG 제품 층에서 확인된 구조 문제(분류 누락이 아니라 입도 문제)

| 항목 | 실측 | 의미 |
|---|---|---|
| Frame 70개의 라벨 | DJI Agras·Matrice, AeroVironment Puma, eBee, WingtraOne 등 완기체·플랫폼 명칭이 다수 포함 | 프레임 부품과 완기체가 한 클래스에 섞임(정확한 개수는 미집계) |
| Sensor 22개의 하위 종류(키워드 판정) | LiDAR 9, GNSS 7, 레이더 2, IMU 2, 광학흐름 1, 기타 1 | 계층에 LiDAR·IMU·GNSS 클래스가 있으나 제품은 `Sensor`로 묶여 있고, 같은 GNSS 제품이 `GNSS` 클래스(106개)에도 있어 기준이 일관되지 않음 |
| 제품 `platform` 필드 | 값 있음 215, 없음 479 | 기체 유형(fixed-wing/vtol) 정보는 부분적으로만 있음 |

hardware 도메인에서 클래스가 없는 92건 중 슬러그 규칙으로 잡히는 묶음(추정, 묶음 간 중복 가능)

| 묶음 | 건수(추정) | 예시 슬러그 |
|---|---|---|
| DJI·소비자 촬영 기기 | 17 | dji-mavic-4-pro, dji-osmo-pocket-4p-dlog2, insta360-x6 |
| FPV 완제품·부품 | 15 | emax-tinyhawk-aero, betafpv-p1-digital-fpv-system, elrs-41-release |
| 제조사·기업·플랫폼 개체 | 20 | skydio, dji-enterprise, wingtraray, ideaforge-yeti-heavy-lift |
| FC 설정 가이드 | 3 | cuav-setup-params, holybro-setup-params, fc-vendor-param-guide |

### 1.3 뉴스 계열

| 구분 | 개수 | 클래스 있음 | 클래스 없음 | 비고 |
|---|---|---|---|---|
| 뉴스 문서(`drone-news-*` 32건 + `drone-delivery-news` 1건) | 34 | 0 | 33 (100%) | 일자별 29건, 주제별 모음 4건 |
| 뉴스 문서의 domain | ops-mission 31, hardware 1, regulations 1 | | | 도메인만으로는 주제 구분이 안 됨 |
| 뉴스 문서의 태그 | ops-mission 31, regulations 21, hardware 12, company 4 | | | 한 문서에 여러 주제가 섞임 |
| `news-feed.json` 항목(위키 문서 아님) | 500 | 해당 없음 | 해당 없음 | domain 값이 빈 항목 169(33.8%), type은 news 248·video 82·paper 74·defense 52·gov 24 |

뉴스 문서의 `##` 섹션 제목 계열별 출현 횟수(문서 수가 아니라 섹션 출현 수)

| 주제 계열 | 출현 수 | 제목 예시 |
|---|---|---|
| 규제 | 13 | 규제, 규제 / 공역, 규제 / 표준 |
| 운용·도입 | 12 | 운용 / 도입, 운용/미션, 운용 / 인프라, 운용 / 시장 |
| 하드웨어 | 9 | 하드웨어 / 운용, 하드웨어 / 기업, 하드웨어 / 항법, 하드웨어 / 펌웨어 |
| 방위·대드론 | 6 | 방위 / 대드론, 방산 |
| 시장·산업 | 5 | 시장 / 기업, 산업 / 공급망 |

해석: 한 뉴스 문서가 규제·운용·하드웨어·방위 섹션을 함께 가지므로, 문서 단위로 주제 클래스 하나를 붙이면 정보가 손실됩니다. 직전 승인(`class-approvals-20261024.json`)에서도 뉴스·제품 카드는 의도적으로 제외되었으므로, 이번 제안은 그 제외분을 다루는 후속입니다.

## 2. 클래스 후보

### 2.1 신설 클래스

| 클래스 | 상위 | 대상 | 별칭(CLASS_ALIAS 정규식 후보) | 분류 규칙(판단 근거) | 대상 수 |
|---|---|---|---|---|---|
| NewsDigest | DataArtifact | 뉴스 모음 문서 전체 | `뉴스\|소식\|news digest` | 경로 `concepts/drone-news-*` 또는 `drone-delivery-news`(1순위, 경로 규칙). 제목에 "소식/News" 포함은 보조 확인 | 34 |
| DailyNewsDigest | NewsDigest | 일자별 뉴스 | `일일\s*(뉴스\|소식)` | 경로 `drone-news-YYYY-MM-DD.md` 형식 | 30 |
| TopicNewsDigest | NewsDigest | 주제별 뉴스 모음 | `동향\s*모음` | 경로 `drone-news-{hardware,ops,regulations}`, `drone-delivery-news` | 4 |
| VendorRegistry | DataArtifact | 제조사·제품 레지스트리 문서 | `레지스트리\|registry` | frontmatter `domain: vendor-registry`(1순위). 경로 `vendor-registry-*` 16건은 규칙 확인용, 나머지 2건은 문서별 검토 | 18 |

DailyNewsDigest와 TopicNewsDigest는 NewsDigest의 하위 선택안입니다. 1단계에서는 NewsDigest 하나만 써도 됩니다.

설계 결정: 뉴스의 주제(규제·운용·하드웨어·방위)는 문서 클래스로 쪼개지 않습니다. 기존 `ResearchTopic` 하위의 `RegulationOps` 등에 대한 `aboutClass` 관계로 섹션 단위에서 표현하는 것을 2단계 후보로 둡니다(관계는 구조 정의이며 사실 주장이 아님).

### 2.2 기존 클래스 연결 규칙(신설 없음)

hardware 미분류 92건은 새 클래스 없이 기존 클래스로 충분한 경우가 많습니다. 아래는 규칙별 후보이며 문서별 읽기 검토를 거친 것만 승인합니다.

| 묶음 | 연결 후보(기존 클래스) | 판단 근거 | 후보 수(추정) | 주의 |
|---|---|---|---|---|
| DJI 드론 본체(Mavic·Mini·Neo) | Multirotor | 슬러그 `dji-(mavic\|mini\|neo)-` | 제품 단위로 검토 | 펌웨어 업데이트·루머 문서는 제외 대상 |
| DJI Osmo·Insta360 등 촬영 기기 | Camera 또는 Gimbal | 슬러그 `dji-osmo\|insta360` | 묶음 17에 포함 | 드론이 아닌 기기 |
| FPV 송수신·VTX·ELRS | Datalink | 슬러그 `elrs\|hdzero\|divimath\|betafpv-p1` | 묶음 15에 포함 | 릴리스 노트·수리 팁은 제외 |
| FPV 웁·완제품 | Multirotor | 슬러그 `emax\|hglrc\|axisflying` | 묶음 15에 포함 | 리뷰 문서는 제품 자체인지 검토 |
| FC 설정 가이드 | FlightController | 슬러그 `setup-params\|fc-vendor-param` | 3 | FlightController가 연결된 기존 문서 2건과 성격이 같은지 확인 필요(미확인) |
| 제조사·기업 개체 | Manufacturer | 개체 문서이며 제조사 본인 | 묶음 20에 포함 | 운용 기업·서비스 업체는 제외(Manufacturer 정의 확인 필요) |

### 2.3 KG 제품 층 후보(문서 분류와 별개 안건)

| 후보 | 내용 | 영향 | 처리 방식 |
|---|---|---|---|
| 완기체 분리 | Frame 70개 중 완기체·플랫폼은 기존 `Multirotor`/`VTOL`/`FixedWing`로 이동 | 그래프 노드 클래스 변경, 호환성 규칙(packFits 등) 영향 | 입력 JSON(products-catalog 등)에서만 수정하고 `build-graph.py`로 재생성. 이번 제안의 승인 범위에서 제외하고 별도 안건 |
| Sensor 세분화 | Sensor 22개를 `LiDAR`·`GNSS`·`IMU` 및 신설 `Radar`로 분할 | 위와 동일 | 별도 안건 |

## 3. 적용 원칙과 절차

### 3.1 원칙

| 원칙 | 내용 |
|---|---|
| domain 불변 | 기존 `domain` 값은 자동 변경·추론하지 않습니다. 이번 제안은 `ontology_class`만 다룹니다 |
| 제안→승인 | 규칙은 후보만 만들고, 사람이 승인한 목록만 반영합니다. 키워드 일괄 연결의 오탐 전력이 있습니다 |
| 이미 값 있으면 보존 | 기존 `apply-class-approvals.py` 규칙을 그대로 따라 `ontology_class`가 이미 있는 문서는 건드리지 않습니다 |
| 본문 불변 | frontmatter 한 줄 추가 외에 본문·다른 필드는 바꾸지 않습니다 |
| 발행 게이트 | 문서 변경은 해시 승인(publication manifest) 대상입니다 |

### 3.2 절차

| 단계 | 작업 | 산출물 | 승인 |
|---|---|---|---|
| 0 | 클래스 정의 승인(NewsDigest, VendorRegistry 등) | 승인 기록 | 필요 |
| 1 | `class-hierarchy.json`에 신설 클래스 추가, 별칭을 `CLASS_ALIAS`에 추가(별칭은 질의 인식용이며 문서 클래스를 바꾸지 않음) | 계층·별칭 변경 | 0단계에 포함 |
| 2 | 규칙으로 후보 목록 생성(드라이런, 파일 변경 없음) | 후보 목록 | 불필요 |
| 3 | 묶음당 30건 이내로 문서를 읽고 승인 대상만 선별 | `ontology/class-approvals-YYYYMMDD.json` | 필요 |
| 4 | `apply-class-approvals.py` 미리보기 후 `--apply` | frontmatter 한 줄 추가 | 3단계 승인 |
| 5 | 지식 DB 재생성, 발행 게이트, 배포, 질의 시험 | 검증 결과 | |

단계 구분: 1단계 릴리스는 NewsDigest(34)와 VendorRegistry(18)처럼 경로·frontmatter로 결정되는 묶음만 다룹니다. 2단계 릴리스는 2.2의 기존 클래스 연결을 문서별 검토로 진행합니다.

### 3.3 롤백

| 대상 | 방법 |
|---|---|
| 문서 frontmatter | 해당 승인 파일의 `approved` 경로에서 `ontology_class:` 한 줄을 제거하거나 `~/2nd` 해당 커밋을 `git revert`합니다. 역방향 적용 스크립트는 현재 없으므로 필요하면 `apply-class-approvals.py`의 반대 동작 스크립트를 별도로 작성합니다 |
| 승인 파일 | 해당 `class-approvals-*.json`을 삭제합니다 |
| 계층·별칭 | `class-hierarchy.json`과 `CLASS_ALIAS`의 신설 항목을 되돌립니다. 클래스가 남아 있어도 연결 문서가 없으면 영향이 없습니다 |
| DB·그래프 | 결정론 재생성이므로 `build-knowledge-db.py`를 다시 실행합니다 |
| 배포 | 이전 배포로 롤백하고 발행 manifest의 기준선을 재고정합니다 |

### 3.4 검증

| 검증 | 방법 | 합격 기준 |
|---|---|---|
| 승인 범위 | 적용 전후 diff에서 변경 파일이 승인 목록과 일치하는지 대조 | 목록 외 변경 0건, 본문 변경 0건 |
| domain 불변 | 적용 전후 전 문서의 `domain` 값 비교 | 변경 0건 |
| 기존 클래스 보존 | 적용 전 263건의 `ontology_class` 값 비교 | 변경 0건 |
| DB 정합성 | `build-knowledge-db.py`의 내장 검사(노드 클래스가 계층에 존재, 관계 끝점 존재 등), `scripts/test_knowledge_db.py` | 오류 0건 |
| 계층 검증 | 신설 클래스의 상위가 존재하고 순환이 없는지, `scripts/test-ontology.mjs`로 하위 클래스 전개 확인 | 통과 |
| 별칭 충돌 | 기존 별칭과 신규 별칭이 같은 질의에 중복 매칭되는 사례를 샘플 질의로 점검(예: "규제 뉴스") | 의도하지 않은 매칭 0건 |
| 발행 게이트 | `tests/test_publication_snapshot.py`, `test_publication_reconciliation.py`와 publication gate | 통과 |
| 질의 시험 | 뉴스·레지스트리 관련 질문 몇 건을 배포 후 눈으로 재현 확인 | 클래스 연결 답변으로 표시 |

### 3.5 커버리지 목표

| 시점 | 목표 | 계산 |
|---|---|---|
| 현재 | 263 / 903 = 29.1% | 실측 |
| 1단계(NewsDigest 34 + VendorRegistry 18) | 315 / 903 = 34.9% 이상 | 경로·frontmatter 규칙 대상 52건 |
| 2단계 상한 | 최대 369 / 903 = 40.9% | 2.2 묶음 후보 55건(추정)을 전부 승인한다고 가정한 상한. 실제는 문서별 검토 결과에 따르며 달성을 약속하는 수치가 아님 |

## 4. 위험과 미확인 사항

| 구분 | 내용 | 대응 |
|---|---|---|
| 위험 | 뉴스는 문서 하나에 여러 주제가 섞여, 주제 클래스를 붙이면 오분류가 됩니다 | 문서 클래스는 NewsDigest(형식)로 한정하고 주제는 섹션 관계로 분리 |
| 위험 | NewsDigest 별칭 `뉴스\|소식`이 질의에서 과하게 매칭되어 뉴스 문서를 일반 지식 질문의 근거로 끌어올 수 있습니다 | 뉴스 문서는 신뢰도 낮음(frontmatter confidence: low)이므로 클래스 연결이 `verified` 승급 근거가 되지 않도록 유지 |
| 위험 | 슬러그 규칙 후보는 추정이며 과거 키워드 일괄 연결에서 오탐이 컸습니다 | 문서별 읽기 검토 후 승인 |
| 위험 | 제조사·기업 개체를 `Manufacturer`로 연결하면 운용 업체와 섞일 수 있습니다 | 정의 확인 후 제조사 본인만 연결 |
| 위험 | KG 제품 층 재분류는 호환성 규칙과 답변에 파급됩니다 | 이번 승인 범위에서 제외 |
| 미확인 | `news-feed.json` 500건이 위키 문서로 편입되는 경로와 시점 | 이번 제안은 위키 문서 33건만 대상. 피드 항목 분류는 별도 설계 필요 |
| 미확인 | 별칭 추가가 질의 라우팅에 미치는 실제 영향 | 샘플 질의 회귀 시험으로 확인 필요(이번에 실행하지 않음) |
| 미확인 | Frame 70개 중 완기체 개수, Sensor 세분류의 정확한 수 | 키워드 판정 수치이며 정밀 집계 필요 |
| 미확인 | 역방향(롤백) 적용 스크립트의 부재 | 필요 시 작성 |
| 미확인 | 호출하지 않은 것: 모델 API, 실제 질의 시험, 테스트 실행 | 승인 후 5단계에서 수행 |

## 5. 결정이 필요한 질문

| 번호 | 질문 | 권장안 |
|---|---|---|
| 1 | 신설 범위를 NewsDigest와 VendorRegistry 2개(하위 Daily/Topic 제외)로 먼저 시작해도 되는지 | 2개로 시작, Daily/Topic 세분은 필요가 확인되면 추가 |
| 2 | 뉴스 주제 구분을 문서 클래스가 아니라 섹션 단위 `aboutClass` 관계로 미루는 방향이 맞는지 | 1단계는 형식 클래스만, 주제 관계는 2단계에서 별도 승인 |
| 3 | KG 제품 층의 완기체 분리와 Sensor 세분화를 이번 승인에서 제외하고 별도 안건으로 다루는 것이 맞는지 | 제외하고 별도 안건 |


## 6. 결정과 진행 기록 (2026-10-24)

| 항목 | 내용 |
|---|---|
| 결정 1~3 | 마스터 위임("권장순")에 따라 모두 권장안 채택: NewsDigest·VendorRegistry 2개 신설, 뉴스 주제는 섹션 관계로 보류, Frame·Sensor 세분화는 별도 안건 |
| 수치 정정 | 뉴스 문서는 33건이 아니라 34건(일자별 30, 주제별 3, 배송 뉴스 1)입니다. 목표 커버리지는 315/903(34.9%)로 바뀝니다 |
| 별칭 | 두 클래스 모두 별칭을 두지 않았습니다. 질의 라우팅 영향은 없습니다 |
| 역방향 스크립트 | `~/2nd/scripts/revert-class-approvals.py` 작성, 임시 복사본 5건으로 적용→되돌림 후 파일이 원본과 완전히 같음을 확인했습니다 |
| 준비된 파일(~/2nd, 미적용) | `ontology/class-hierarchy.json`(클래스 2개 추가), `ontology/class-approvals-20261024b.json`(52건). 문서 적용(--apply)과 발행은 아직 하지 않았습니다 |
