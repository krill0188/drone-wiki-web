# 위키 문서 → 온톨로지 클래스 연결 제안 (사람 검토용)

> 생성: `scripts/export-class-proposals.py` (결정론 키워드 규칙). **어떤 문서의 `ontology_class`도 자동으로 바꾸지 않았습니다.** 승인한 제안만 해당 문서 frontmatter에 반영하며, 문서 변경은 발행 게이트(해시 승인) 대상입니다.

- 현재 `ontology_class`가 명시된 문서: 12 / 638
- 제안 301건 · 문서 238개 · 등급 A 130 · B 56 · C 115

| 등급 | 의미 | 권장 |
|---|---|---|
| A | 슬러그·제목에 클래스 고유 키워드, 후보 클래스가 하나 | 일괄 승인 후보 |
| B | 슬러그·제목에서 여러 클래스가 걸림 | 문서별 검토 |
| C | 태그만 일치 | 보류(약한 근거) |

## 등급 A — 일괄 승인 후보 (130건)

### ArduPilot (8)
- `concepts/ardupilot-architecture.md` — ArduPilot Architecture _(slug: ardupilot)_
- `concepts/ardupilot-params-by-version.md` — ArduPilot 버전별 주요 파라미터 변경점 (4.4~4.7) _(slug: ardupilot)_
- `concepts/ardupilot-plane-4-7.md` — ArduPilot Plane 4.7.0 _(slug: ardupilot)_
- `concepts/holybro-x650-autonomous-mission.md` — HolyBro X650 Autonomous Mission Planning with Ardu _(title: ardupilot)_
- `concepts/param-diff-copter-4-6-0-4-7-0.md` — ArduPilot Copter 4.6.0 → 4.7.0 파라미터 변경 전체 목록 _(title: ardupilot)_
- `concepts/param-diff-copter-4-7-0-4-7-1.md` — ArduPilot Copter 4.7.0 → 4.7.1 파라미터 변경 전체 목록 _(title: ardupilot)_
- `concepts/param-diff-plane-4-7-0-4-7-1.md` — ArduPilot Plane 4.7.0 → 4.7.1 파라미터 변경 전체 목록 _(title: ardupilot)_
- `entities/ardupilot.md` — ArduPilot _(slug: ardupilot)_

### Battery (8)
- `concepts/amprius-sicore-battery.md` — Amprius SiCore 2세대 배터리 셀 (500 Wh/kg) _(slug: battery)_
- `concepts/drone-power-battery.md` — Drone Power & Battery _(slug: battery)_
- `concepts/kci-uav-battery-ecm-parameter-estimation.md` — 소형 UAV 리튬이온 배터리 ECM 파라미터 추정 (KCI) _(slug: battery)_
- `concepts/lipo-charging-cabinet-fire-test.md` — LiPo 충전·보관 캐비닛 화재 테스트 (Joshua Bardwell) _(slug: lipo)_
- `concepts/rincell-rc50t-drone-cell.md` — Rincell RC50T: NDAA 준수 21700 드론 배터리 셀 _(title: 배터리)_
- `concepts/uav-battery-replacement-planner.md` — UAV Battery Replacement Mission Planner _(slug: battery)_
- `concepts/uav-battery-soh-transfer-learning.md` — UAV 배터리 SoH 예측: 전이학습 기반 예지 정비 _(slug: battery)_
- `concepts/vendor-registry-battery.md` — 드론 배터리 제조사 레지스트리 _(slug: battery)_

### Camera (2)
- `concepts/dji-mavic-4-pro-features.md` — DJI Mavic 4 Pro Camera and Lito X1 ActiveTrack _(title: camera)_
- `concepts/event-camera-drone.md` — Event Camera for Drones _(slug: camera)_

### Datalink (15)
- `concepts/advanced-mavlink.md` — Advanced MAVLink _(slug: mavlink)_
- `concepts/cross-layer-attacks-uav-5g.md` — Cross-Layer Attacks on UAV C2 over 5G _(slug: 5g)_
- `concepts/datalink-communication.md` — Datalink Communication _(slug: datalink)_
- `concepts/flyblind-cross-slice-timeliness-attack.md` — FlyBlind: 5G 슬라이스 간 적시성 공격(Silent State Staleness) _(title: 5g)_
- `concepts/mavlink-advanced-features.md` — MAVLink Advanced Features _(slug: mavlink)_
- `concepts/mavlink-advanced.md` — MAVLink Advanced Features _(slug: mavlink)_
- `concepts/mavlink-protocol-deep.md` — MAVLink Protocol Deep Dive — 메시지 구조와 마이크로서비스 _(slug: mavlink)_
- `concepts/mavlink-protocol.md` — MAVLink Protocol _(slug: mavlink)_
- `concepts/mavlink2-security.md` — MAVLink 2 & Security _(slug: mavlink)_
- `concepts/mavshield-mavlink-security-cipher.md` — MAVShield: Novel Cipher for Enhancing MAVLink Secu _(slug: mavlink)_
- `concepts/pymavlink-v2-4-50.md` — pymavlink v2.4.50 Release _(slug: mavlink)_
- `concepts/pymavlink.md` — pymavlink _(slug: mavlink)_
- `concepts/uav-alternative-power-hybrid-fuel-cell-research.md` — UAV 대안 동력원 연구: ICE 하이브리드와 PEM 연료전지 _(slug: lte)_
- `concepts/vendor-registry-datalink.md` — 드론 데이터링크·통신 라디오 제조사 레지스트리 _(slug: datalink)_
- `entities/mavlink.md` — MAVLink Protocol _(slug: mavlink)_

### ESC (2)
- `concepts/drone-esc-failure-cases.md` — ESC 고장 사례: AAIB Velos 추락과 BetaFPV Beta85X 화재 _(slug: -esc)_
- `concepts/vendor-registry-esc.md` — 드론 ESC 제조사 레지스트리 _(slug: -esc)_

### FixedWing (1)
- `concepts/kci-fixed-wing-return-feasibility-logic.md` — 전기 추진 고정익 무인기 복귀 가능 여부 판단 로직 (KCI) _(slug: fixed-wing)_

### FlightController (3)
- `concepts/flight-controller-hardware.md` — Flight Controller Hardware _(slug: flight-controller)_
- `concepts/pixhawk-setup-params.md` — Pixhawk 6X/6C 초기 파라미터 설정 _(slug: pixhawk)_
- `concepts/vendor-registry-fc.md` — 드론 비행제어기 제조사 레지스트리 _(title: 비행제어기)_

### FlightStack (4)
- `concepts/betaflight-fc-alignment-wizard.md` — Betaflight 2026.6 FC Alignment Wizard _(slug: betaflight)_
- `concepts/betaflight.md` — Betaflight _(slug: betaflight)_
- `concepts/dji-mavic-4-pro-firmware-update.md` — DJI Mavic 4 Pro Firmware Update (Aug 2026) _(slug: firmware)_
- `concepts/software-registry-flight-stack.md` — 드론 비행 스택 SW 레지스트리 _(slug: flight-stack)_

### Frame (7)
- `concepts/aero-llm-framework.md` — Aero-LLM: Distributed Framework for Secure UAV Com _(slug: -frame)_
- `concepts/aeroeval-mdo-framework.md` — AeroEval MDO Framework _(slug: -frame)_
- `concepts/axisflying-bando-5-review.md` — AXISFLYING Bando 5 알루미늄 프레임 5인치 드론 리뷰 _(title: 프레임)_
- `concepts/kci-tank-zone-vulnerability-selective-counter-drone-protection.md` — 전차 기능구역별 취약도 평가 기반 선택적 대드론 방호 설계 프레임워크 (KCI) _(title: 프레임)_
- `concepts/llm-uav-carrier-tactical-agent.md` — 무인기 모함 LLM 기반 자율 전술 에이전트 프레임워크 _(title: 프레임)_
- `concepts/uav-airframe-structure-optimization-research.md` — UAV 프레임 구조 최적화·모듈형 플랫폼 연구 _(slug: airframe)_
- `concepts/vendor-registry-frame.md` — 드론 프레임·완기체 제조사 레지스트리 _(slug: -frame)_

### GNSS (6)
- `concepts/gnss-denied-remote-autonomy.md` — GNSS-Denied Remote Autonomy for Small UAVs _(slug: gnss)_
- `concepts/kci-dual-nis-sac-gnss-ins-spoofing.md` — 이중 NIS 보상 SAC 기반 GNSS/INS 무인기 은닉 기만 기법 (KCI) _(slug: gnss)_
- `concepts/rtk-gps-precise-landing.md` — RTK GPS & Precise Landing _(slug: rtk)_
- `concepts/visual-slam-gps-denied-evaluation.md` — Visual SLAM GPS-Denied Evaluation _(slug: gps)_
- `concepts/vlm-fsm-copilot-uav-navigation.md` — FSM-VLM 하이브리드 UAV 항법: GPS 미사용 환경의 지연·신뢰성 분석 _(title: gps)_
- `entities/dji-matrice-350-rtk.md` — DJI Matrice 350 RTK와 Zenmuse H30T 운용 사양·사례 _(slug: rtk)_

### Gimbal (2)
- `concepts/hequav-k11-dual-sensor-gimbal.md` — HEQUAV K11 듀얼 센서 짐벌 + Scepter 15 컨트롤러 _(slug: gimbal)_
- `concepts/hoverair-versa-2in1-2026.md` — HoverAir Versa 2-in-1 Gimbal Drone _(title: gimbal)_

### IMU (5)
- `concepts/drone-simulation.md` — Drone Simulation _(slug: imu)_
- `concepts/slei3d-heterogeneous-fleet-exploration.md` — SLEI3D: Simultaneous Exploration and Inspection vi _(title: imu)_
- `concepts/slei3d-heterogeneous-fleet.md` — SLEI3D - Simultaneous Exploration and Inspection v _(title: imu)_
- `concepts/software-registry-simulation.md` — 드론 시뮬레이션 SW 레지스트리 _(slug: imu)_
- `concepts/ukraine-fight-drone-simulator.md` — Ukrainian Fight Drone Simulator _(slug: imu)_

### LiDAR (6)
- `concepts/drone-lidar-forest-boundary.md` — 드론 라이다를 이용한 임야 현황경계 추출 및 분석 _(slug: lidar)_
- `concepts/emesent-trimble-lidar-integration.md` — Emesent 모바일 SLAM 스캐너 — Trimble Connect 직접 연동 _(slug: lidar)_
- `concepts/flight-ready-lidar-inertial-odometry.md` — Flight-Ready LiDAR-Inertial Odometry for Embedded  _(slug: lidar)_
- `concepts/kci-uav-lidar-ground-point-density-dem-accuracy.md` — UAV-LiDAR 지면점 밀도와 공간 해상도가 DEM 정확도에 미치는 영향 _(slug: lidar)_
- `concepts/kci-watershed-individual-tree-delineation-uav-lidar-chm.md` — UAV LiDAR CHM·그레이스케일 Watershed 개체목 분할 최적 조건 (KCI 2 _(slug: lidar)_
- `concepts/vendor-registry-lidar.md` — 드론 LiDAR 제조사 레지스트리 _(slug: lidar)_

### Motor (4)
- `concepts/brinc-emergency-drone-funding.md` — BRINC Emergency Drone Funding with Motorola _(title: motor)_
- `concepts/cyclic-mpdr-beamforming-uav-motor-noise.md` — cMPDR 빔포밍: 거의 주기정상 음향 간섭(UAV 모터) 억제 _(slug: motor)_
- `concepts/fpv-motor-selection-guide.md` — FPV Drone Motor Selection Guide _(slug: motor)_
- `concepts/vendor-registry-motor.md` — 드론 모터 제조사 레지스트리 _(slug: motor)_

### Multirotor (14)
- `concepts/agile-quadrotor-learning.md` — Agile Quadrotor Flight Learning _(slug: quadrotor)_
- `concepts/calos-lyapunov-safety-layer-quadrotor-rl.md` — CALOS: 쿼드로터 안전 강화학습을 위한 Control-Affine Lyapunov On _(slug: quadrotor)_
- `concepts/crazyflie-brushless-dynamics-model.md` — How to Model Your Crazyflie Brushless: 나노 쿼드콥터 동역학 _(title: 쿼드콥터)_
- `concepts/e2e-fly-end-to-end-quadrotor.md` — E2E-Fly: End-to-End Quadrotor Autonomy System _(slug: quadrotor)_
- `concepts/fam-dq-dual-quadrotor-aerial-manipulator.md` — FAM-DQ: 듀얼 쿼드로터 완전구동 공중 매니퓰레이터 _(slug: quadrotor)_
- `concepts/kci-quadrotor-compound-fault-accommodation.md` — 쿼드로터 센서·구동기 복합 고장 보완 기법 (KCI) _(slug: quadrotor)_
- `concepts/multirotor-energy-power-models.md` — 멀티로터 전력·에너지 소비 모델 연구 _(slug: multirotor)_
- `concepts/multirotor-propulsion-sizing-methods.md` — 멀티로터 추진계·질량 사이징 방법 (Dai 2019, Burela 2026) _(slug: multirotor)_
- `concepts/quadrotor-wind-fidelity-ppo-robustness.md` — 쿼드로터 RL 제어의 학습 바람장 충실도 비교 (PPO vs PID/SE(3)) _(slug: quadrotor)_
- `concepts/rl-quadrotor-tunable-control.md` — RL-Based Quadrotor Control with Tunable Performanc _(slug: quadrotor)_
- `concepts/skyjepa-world-models.md` — SkyJEPA: Long-Horizon World Models for Quadrotor C _(title: quadrotor)_
- `concepts/spatial-dubins-quadrotor-control.md` — Spatial Dubins Airplane-Based Reference Smoothing  _(slug: quadrotor)_
- `concepts/temporal-cascading-quadrotor-mpc.md` — Temporal Cascading of Planning and Control for Qua _(slug: quadrotor)_
- `concepts/time-optimal-quadrotor-waypoints.md` — Time-Optimal Planning for Quadrotor Waypoint Fligh _(slug: quadrotor)_

### PX4 (11)
- `concepts/e-rocket-tvc-gnc-testbed.md` — E-Rocket: TVC 로켓 GNC 검증용 저가 테스트베드 (PX4 + ROS 2) _(title: px4)_
- `concepts/param-diff-px4-1-16-0-1-17-0.md` — PX4 v1.16.0 → v1.17.0 파라미터 변경 전체 목록 _(slug: px4)_
- `concepts/px4-architecture-deep.md` — PX4 Architecture Deep — uORB, Tasks, Work Queue 심층 _(slug: px4)_
- `concepts/px4-cicd-pipeline.md` — PX4 CI/CD Pipeline _(slug: px4)_
- `concepts/px4-control-tuning.md` — PX4 Control & Tuning _(slug: px4)_
- `concepts/px4-offboard-control.md` — PX4 Offboard Control _(slug: px4)_
- `concepts/px4-params-by-version.md` — PX4 버전별 주요 파라미터 변경점 (v1.14~v1.17) _(slug: px4)_
- `concepts/px4-pid-tuning.md` — PX4 PID Control Tuning _(slug: px4)_
- `concepts/px4-system-architecture.md` — PX4 System Architecture _(slug: px4)_
- `concepts/px4-tuning-control.md` — PX4 Tuning & Control _(slug: px4)_
- `concepts/px4-v1-17.md` — PX4 v1.17.0 _(slug: px4)_

### Payload (6)
- `concepts/drone-payload-systems.md` — Drone Payload Systems _(slug: payload)_
- `concepts/event38-tb2-drops-integration.md` — Event38-TB2 DROPS 통합: 모듈형 페이로드 시스템 _(title: 페이로드)_
- `concepts/multi-uav-payload-transport-rao-controllers.md` — 다중 UAV 페이로드 운송 제어 (Rao 외, 2022) _(slug: payload)_
- `concepts/payload-dependent-green-drone-routing.md` — 페이로드 의존 에너지 효율 드론 배송 경로 계획 _(slug: payload)_
- `concepts/uav-cable-payload-cooperative-transport-research.md` — 다중 UAV 케이블 매달림 페이로드 운송 연구 (센서·유도·입력성형) _(slug: payload)_
- `concepts/vendor-registry-payload-mech.md` — 드론 투하·윈치·낙하산 제조사 레지스트리 _(slug: payload)_

### Propeller (3)
- `concepts/pmsm-sensorless-controller-observer.md` — PMSM 센서리스 제어기-관측기 (UAV 프로펠러 적용) _(title: 프로펠러)_
- `concepts/uav-propeller-fault-detection-hybrid-data.md` — UAV 프로펠러 고장 탐지: 하이브리드 데이터 생성 모델 _(slug: propeller)_
- `concepts/vendor-registry-propeller.md` — 드론 프로펠러 제조사 레지스트리 _(slug: propeller)_

### ROS2 (5)
- `concepts/mavros.md` — MAVROS _(slug: mavros)_
- `concepts/ros2-advanced-integration.md` — ROS2 Advanced Integration _(slug: ros2)_
- `concepts/ros2-advanced.md` — ROS2 Advanced Integration _(slug: ros2)_
- `concepts/ros2-drone-integration.md` — ROS2 Drone Integration _(slug: ros2)_
- `concepts/ros2-lyrical.md` — ROS 2 Lyrical Luth _(slug: ros2)_

### SwarmCoordinator (16)
- `concepts/addiff-gt-uav-swarm-self-healing.md` — AdDiff-GT: UAV 군집 네트워크 커버리지 보존 자가 복구 _(slug: swarm)_
- `concepts/calibrate-once-fly-any-team-swarm-training.md` — Calibrate Once, Fly Any Team — 저충실도 시뮬레이션 기반 드론 군집 _(slug: swarm)_
- `concepts/distributed-aerial-surveillance-swarm.md` — Distributed Continuous Aerial Surveillance by UAS  _(slug: swarm)_
- `concepts/federated-lightweight-intrusion-detection.md` — Federated Lightweight Intrusion Detection in Drone _(title: swarm)_
- `concepts/game-theoretic-drone-swarm-defense.md` — 게임이론 기반 드론 스웜 방어(차등 게임 응용 사례) _(slug: swarm)_
- `concepts/kci-llm-cbba-swarm-task-allocation.md` — LLM 전략 파라미터 생성 기반 상황 적응형 군집 무인기 임무 할당 _(slug: swarm)_
- `concepts/kci-uav-swarm-mission-reliability-abort.md` — 재구성형 UAV 스웜의 임무 중단을 고려한 임무 신뢰도 모델링 및 평가 _(slug: swarm)_
- `concepts/kci-uwb-degraded-uav-swarm-positioning.md` — UWB 품질 저하 환경에서 UAV 군집측위 최소운용조건 분석 (KCI) _(slug: swarm)_
- `concepts/recon-swarm-project.md` — Recon Swarm Project — 지능형 자율 군집정찰드론 _(slug: swarm)_
- `concepts/software-registry-swarm-multiagent.md` — 드론 군집·멀티에이전트 SW 레지스트리 _(slug: swarm)_
- `concepts/swarm-coordination.md` — Swarm Drone Coordination _(slug: swarm)_
- `concepts/swarm-modes.md` — Swarm Modes — 군집 드론 운용 모드 _(slug: swarm)_
- `concepts/swarmnxt-aerial-swarm-platform.md` — SwarmNxt: 고속 애자일 공중 스웜을 위한 오픈소스 SW-HW 플랫폼 _(slug: swarm)_
- `concepts/uav-swarm-ai-trends-kci.md` — UAV 군집 AI 기술 동향: 인공지능 발전과 다중 에이전트 아키텍처의 진화 _(slug: swarm)_
- `concepts/uav-swarm-air-ground-isac.md` — 교차 지역 협력 기반 Air-Ground ISAC UAV 군집 _(slug: swarm)_
- `concepts/uav-swarm-target-localization.md` — UAV Swarm Target Localization via Detection-Aided  _(slug: swarm)_

### VTOL (2)
- `concepts/indi-stability-tilt-rotor-vtol.md` — INDI Pitch-Rate Controller Stability Analysis for  _(slug: vtol)_
- `concepts/skydrive-verty-korea-evtol-mou.md` — SkyDrive-Verty 한국 eVTOL 상용화 MOU _(slug: vtol)_

## 등급 B — 문서별 검토 (56건)

### ArduPilot (2)
- `comparisons/fc-firmware-comparison.md` — FPV 드론 FC 펌웨어 비교: Betaflight vs INAV vs ArduPilot _(title: ardupilot)_
- `concepts/ros2-drone-deep.md` — ROS2 Drone Integration Deep — PX4/ArduPilot 연동 상세 _(title: ardupilot)_

### Battery (3)
- `concepts/fpv-battery-maintenance.md` — FPV Drone Battery Maintenance and ND Filters _(slug: battery)_
- `concepts/kci-lidar-slam-indoor-battery-monitoring-iot-uav.md` — LiDAR-SLAM 기반 실내 배터리 모니터링 IoT-UAV 플랫폼 (KCI) _(slug: battery)_
- `concepts/uav-battery-recharge-agent-based-simulation.md` — UAV 배터리 재충전 조정 에이전트 기반 시뮬레이션 (Grando 외, 2025) _(slug: battery)_

### Camera (4)
- `concepts/gps-uav-imu.md` — GPS 미수신 환경에 특화된 마이크로드론/UAV 위치추정 기법들은 공통적으로 외부 위치 인 _(title: 카메라)_
- `concepts/hoverair-versa.md` — HoverAir Versa: 짐벌-드론 하이브리드 카메라 _(title: 카메라)_
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(title: 카메라)_
- `concepts/vendor-registry-camera.md` — 드론 카메라·짐벌 제조사 레지스트리 _(slug: camera)_

### Datalink (3)
- `concepts/fpv-battery-maintenance.md` — FPV Drone Battery Maintenance and ND Filters _(title: lte)_
- `concepts/kci-mavlink-virtual-decoy-swarm-deception.md` — MAVLink 변조 기반 가상 디코이 군집 기만 시스템 _(slug: mavlink)_
- `concepts/mavlink-m-interoperability.md` — A New Era of Interoperable Payloads Begins at the  _(slug: mavlink)_

### ESC (1)
- `concepts/bldc-motor-esc-characterization-research.md` — BLDC 모터·ESC 특성 측정·모델링 연구 (효율·열·추력 모델) _(slug: -esc)_

### FixedWing (2)
- `concepts/inav-fixed-wing-servo-direction-checklist.md` — INAV 고정익 서보 방향 오류 3단계 점검 _(slug: fixed-wing)_
- `concepts/propeller-feedback-airspeed-estimation.md` — 프로펠러 피드백만으로 고정익 대기속도 추정 (Ntouros 외, 2025) _(title: 고정익)_

### FlightController (1)
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(slug: pixhawk)_

### FlightStack (4)
- `comparisons/fc-firmware-comparison.md` — FPV 드론 FC 펌웨어 비교: Betaflight vs INAV vs ArduPilot _(slug: firmware)_
- `concepts/inav-fixed-wing-servo-direction-checklist.md` — INAV 고정익 서보 방향 오류 3단계 점검 _(slug: inav)_
- `concepts/px4-flight-modes.md` — PX4 Flight Modes _(slug: px4-flight)_
- `entities/px4-flight-stack.md` — PX4 Flight Stack _(slug: flight-stack)_

### Frame (3)
- `concepts/autotrans-uav-suspended-payload-planning-control.md` — AutoTrans: 현수 페이로드 UAV 계획·제어 프레임워크 _(title: 프레임)_
- `concepts/llm-swarm-wot-framework.md` — LLM Swarm WoT Framework _(slug: -frame)_
- `concepts/oddityrc-echo5-frame-gps.md` — OddityRC Echo5 5인치 프레임·마이크로 GPS·ELRS 수신기 _(slug: -frame)_

### GNSS (5)
- `concepts/decentralized-swarm-gps-denied.md` — Decentralized UAV Swarms in GPS/Communication-Deni _(slug: gps)_
- `concepts/gps-uav-imu.md` — GPS 미수신 환경에 특화된 마이크로드론/UAV 위치추정 기법들은 공통적으로 외부 위치 인 _(slug: gps)_
- `concepts/oddityrc-echo5-frame-gps.md` — OddityRC Echo5 5인치 프레임·마이크로 GPS·ELRS 수신기 _(slug: gps)_
- `concepts/rigid-covert-gnss-spoofing-swarm.md` — Rigid-Covert GNSS Spoofing: UAV 군집의 구조적 탐지 사각지대 _(slug: gnss)_
- `concepts/vendor-registry-gnss-imu.md` — 드론 GNSS·IMU·센서 제조사 레지스트리 _(slug: gnss)_

### Gimbal (2)
- `concepts/hoverair-versa.md` — HoverAir Versa: 짐벌-드론 하이브리드 카메라 _(title: 짐벌)_
- `concepts/vendor-registry-camera.md` — 드론 카메라·짐벌 제조사 레지스트리 _(title: 짐벌)_

### IMU (5)
- `concepts/gps-uav-imu.md` — GPS 미수신 환경에 특화된 마이크로드론/UAV 위치추정 기법들은 공통적으로 외부 위치 인 _(slug: imu)_
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(slug: imu)_
- `concepts/px4-simulation.md` — PX4 Simulation (SITL) _(slug: imu)_
- `concepts/uav-battery-recharge-agent-based-simulation.md` — UAV 배터리 재충전 조정 에이전트 기반 시뮬레이션 (Grando 외, 2025) _(slug: imu)_
- `concepts/vendor-registry-gnss-imu.md` — 드론 GNSS·IMU·센서 제조사 레지스트리 _(slug: imu)_

### LiDAR (2)
- `concepts/kci-lidar-slam-indoor-battery-monitoring-iot-uav.md` — LiDAR-SLAM 기반 실내 배터리 모니터링 IoT-UAV 플랫폼 (KCI) _(slug: lidar)_
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(slug: lidar)_

### Motor (2)
- `concepts/bldc-motor-esc-characterization-research.md` — BLDC 모터·ESC 특성 측정·모델링 연구 (효율·열·추력 모델) _(slug: motor)_
- `concepts/bldc-motor-propeller-digital-twin-static-thrust.md` — BLDC 모터-프로펠러 디지털 트윈: 정지 추력 예측 (Gauthier 외, 2023) _(slug: motor)_

### Multirotor (1)
- `concepts/multirotor-propeller-test-research.md` — 프로펠러 성능 시험·측정 연구 (벤치, 저 Re, 덕티드 동축) _(slug: multirotor)_

### PX4 (4)
- `concepts/px4-flight-modes.md` — PX4 Flight Modes _(slug: px4)_
- `concepts/px4-simulation.md` — PX4 Simulation (SITL) _(slug: px4)_
- `concepts/ros2-drone-deep.md` — ROS2 Drone Integration Deep — PX4/ArduPilot 연동 상세 _(title: px4)_
- `entities/px4-flight-stack.md` — PX4 Flight Stack _(slug: px4)_

### Payload (2)
- `concepts/autotrans-uav-suspended-payload-planning-control.md` — AutoTrans: 현수 페이로드 UAV 계획·제어 프레임워크 _(slug: payload)_
- `concepts/mavlink-m-interoperability.md` — A New Era of Interoperable Payloads Begins at the  _(title: payload)_

### Propeller (3)
- `concepts/bldc-motor-propeller-digital-twin-static-thrust.md` — BLDC 모터-프로펠러 디지털 트윈: 정지 추력 예측 (Gauthier 외, 2023) _(slug: propeller)_
- `concepts/multirotor-propeller-test-research.md` — 프로펠러 성능 시험·측정 연구 (벤치, 저 Re, 덕티드 동축) _(slug: propeller)_
- `concepts/propeller-feedback-airspeed-estimation.md` — 프로펠러 피드백만으로 고정익 대기속도 추정 (Ntouros 외, 2025) _(slug: propeller)_

### ROS2 (1)
- `concepts/ros2-drone-deep.md` — ROS2 Drone Integration Deep — PX4/ArduPilot 연동 상세 _(slug: ros2)_

### SwarmCoordinator (5)
- `concepts/decentralized-swarm-gps-denied.md` — Decentralized UAV Swarms in GPS/Communication-Deni _(slug: swarm)_
- `concepts/kci-mavlink-virtual-decoy-swarm-deception.md` — MAVLink 변조 기반 가상 디코이 군집 기만 시스템 _(slug: swarm)_
- `concepts/kci-vtol-swarm-takeoff-landing-operation.md` — 다수 VTOL 무인기 군집비행 이착륙 운용방안 (KCI) _(slug: swarm)_
- `concepts/llm-swarm-wot-framework.md` — LLM Swarm WoT Framework _(slug: swarm)_
- `concepts/rigid-covert-gnss-spoofing-swarm.md` — Rigid-Covert GNSS Spoofing: UAV 군집의 구조적 탐지 사각지대 _(slug: swarm)_

### VTOL (1)
- `concepts/kci-vtol-swarm-takeoff-landing-operation.md` — 다수 VTOL 무인기 군집비행 이착륙 운용방안 (KCI) _(slug: vtol)_

