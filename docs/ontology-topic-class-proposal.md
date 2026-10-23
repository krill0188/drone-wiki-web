# 온톨로지 '주제 클래스' 신설 제안서 (2026-10-23, 승인 전)

> 위키 문서는 크게 두 종류입니다. **개체 문서**(PX4·ArduPilot·ROS 2·제품 카드)는 클래스에 연결되어 있지만, **연구·기법 문서**(논문, 측정, 사례)는 '개체'가 아니라서 지금까지 클래스 연결을 거부해 왔습니다. 그 결과 문서의 약 85%가 온톨로지 클래스가 없어 `ontology-linked` 답변이 되지 못합니다. 이 제안은 연구·기법 문서를 담는 **주제 클래스(Topic)** 계층을 따로 두는 안입니다.

- 현재 `ontology_class`가 명시된 문서: 110 / 841 (concepts 기준)
- 아래 10개 주제 클래스로 새로 연결 가능한 문서: **237건** (슬러그 규칙 기준 추정치, 문서별 검토 전)

## 제안 구조

- 최상위 `ResearchTopic ⊑ Thing`을 두고 그 아래에 10개 주제 클래스를 둡니다. 각 주제 클래스는 관련 기존 클래스(GNSS, PX4 등)와 `aboutClass` 관계로 연결합니다(구조 정의, 사실 아님).
- 문서의 `ontology_class`에는 **주제 클래스만** 넣습니다. 개체 클래스(PX4 등)와 겹치면 개체 클래스가 우선입니다.
- 신설은 클래스 제안으로만 반영합니다. 문서별 연결은 사람이 승인한 묶음만 frontmatter에 한 줄 추가합니다(domain 자동 변경 금지, 발행 게이트 대상).

## 후보 10개

| 주제 클래스 | 설명 | 관련 기존 클래스 | 해당 문서 | 아직 클래스 없음 | 예시 슬러그 |
|---|---|---|---|---|---|
| GNSSInterferenceSecurity | GNSS 재밍·스푸핑·보안 연구 | GNSS, Security | 20 | 19 | jamming-ardupilot-ekf3-jamming-exp, jamming-elaraby-hierarchical-dithe, jamming-esa-jammertest-2026 |
| PrecisePositioning | 정밀 측위(RTK·PPK·PPP)와 기준국 | GNSS | 21 | 20 | korea-kci-kim-ngii-network-rtk-tes, korea-kci-lee-network-rtk-mountpoi, korea-ngii-geodesy-portal-access-a |
| GNSSDeniedNavigation | GNSS 거부 환경 항법·센서 융합 | GNSS, IMU, FlightController | 19 | 15 | fusion-ardupilot-ekf3-gps-overview, fusion-ardupilot-gps-blending, fusion-ardupilot-gps-for-yaw-dual- |
| GNSSSignalsEnvironment | GNSS 신호 규격·안테나 설치 환경 | GNSS | 21 | 19 | env-ardupilot-gps-how-it-works-doc, env-ardupilot-gps-mounting-doc, env-basler-usb3-2.4ghz-gps-note |
| TimingLatency | 지연·시간 동기 측정 | FlightController, Camera, IMU | 19 | 18 | ai-latency-ardupilot-companion-uar, ai-latency-companion-fc-dds-vs-mav, ai-latency-px4-offboard-afio-forum |
| EdgeAIPerformance | 엣지 AI 성능·모델 배포 | Companion computer | 99 | 73 | ai-compression-deep-compression-ha, ai-compression-distillation-hinton, ai-edge-jetson-orin-nano-agx-yolo- |
| FlightLogData | 비행 로그·데이터셋 | PX4, ArduPilot, ROS2 | 15 | 9 | data-anomaly-alfa-keipour-2019, data-anomaly-resam-islam-2022, data-dataset-uavid |
| SwarmResearch | 군집·다중 에이전트 연구 | SwarmCoordinator | 23 | 21 | addiff-gt-uav-swarm-self-healing, ai-fl-uav-distributed-ml-swarms-di, ai-fl-uav-privllmswarm-mpc-ayana-2 |
| QuadrotorControl | 쿼드로터 제어·학습 연구 | Multirotor | 10 | 9 | agile-quadrotor-learning, calos-lyapunov-safety-layer-quadro, e2e-fly-end-to-end-quadrotor |
| RegulationOps | 법규·운용 절차(국내외) | — | 34 | 34 | ai-cert-arp6983-ed324-easa-ai-days, ai-cert-do178c-ml-dmitriev-low-cri, ai-cert-do178c-ml-runway-sign-clas |

## 기대 효과와 위험

- 효과: 연구·기법 질문(예: "GNSS 재밍 대응 연구", "RTK 기선 길이 오차")이 위키 요약 기반(wiki-sourced)이 아니라 클래스 연결(ontology-linked) 답변이 되어 근거 표시와 신뢰도 기준이 한 단계 올라갑니다.
- 위험: 슬러그 규칙은 추정입니다. 문서별로 읽고 주제가 맞는 것만 승인해야 합니다(과거 키워드 일괄 연결에서 오탐이 컸던 경험). 주제 클래스는 '개체'가 아니므로 `verified` 승급 근거가 되지 않습니다.
- 되돌리기: 승인 파일(ontology/class-approvals-*.json)을 지우고 문서 frontmatter 한 줄을 제거하면 되며, DB는 결정론 재생성입니다.

## 승인 요청

1. 주제 클래스 10개 신설 여부(이름·묶음 조정 가능)
2. 승인 시 순서: 클래스 정의 → 문서별 읽기 검토(묶음당 30건 이내) → 승인 파일 → 발행 게이트 → 배포 → 질문 시험
