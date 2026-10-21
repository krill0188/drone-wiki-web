# 위키 문서 → 온톨로지 클래스 연결 제안 (사람 검토용)

> 생성: `scripts/export-class-proposals.py` (결정론 키워드 규칙). **어떤 문서의 `ontology_class`도 자동으로 바꾸지 않았습니다.** 승인한 제안만 해당 문서 frontmatter에 반영하며, 문서 변경은 발행 게이트(해시 승인) 대상입니다.

- 현재 `ontology_class`가 명시된 문서: 118 / 852
- 제안 323건 · 문서 258개 · 등급 A 129 · B 66 · C 128

| 등급 | 의미 | 권장 |
|---|---|---|
| A | 슬러그·제목에 클래스 고유 키워드, 후보 클래스가 하나 | 일괄 승인 후보 |
| B | 슬러그·제목에서 여러 클래스가 걸림 | 문서별 검토 |
| C | 태그만 일치 | 보류(약한 근거) |

## 등급 A — 일괄 승인 후보 (129건)

### ArduPilot (3)
- `concepts/data-flightlog-ardupilot-aplogger-formats.md` — AP_Logger README: format types, units, multipliers _(slug: ardupilot)_
- `concepts/data-flightlog-ardupilot-dataflash.md` — Downloading and Analyzing Data Logs in Mission Pla _(slug: ardupilot)_
- `concepts/holybro-x650-autonomous-mission.md` — HolyBro X650 Autonomous Mission Planning with Ardu _(title: ardupilot)_

### Battery (5)
- `concepts/conv-energy-comm-trajectory-battery-im-2023.md` — Trajectory Optimization for Cellular-Enabled UAV w _(slug: battery)_
- `concepts/fpv-battery-maintenance.md` — FPV Drone Battery Maintenance and ND Filters _(slug: battery)_
- `concepts/uav-battery-recharge-agent-based-simulation.md` — UAV 배터리 재충전 조정 에이전트 기반 시뮬레이션 (Grando 외, 2025) _(slug: battery)_
- `concepts/uav-battery-replacement-planner.md` — UAV Battery Replacement Mission Planner _(slug: battery)_
- `concepts/vendor-registry-battery.md` — 드론 배터리 제조사 레지스트리 _(slug: battery)_

### Camera (1)
- `concepts/dji-mavic-4-pro-features.md` — DJI Mavic 4 Pro Camera and Lito X1 ActiveTrack _(title: camera)_

### Datalink (1)
- `concepts/vendor-registry-datalink.md` — 드론 데이터링크·통신 라디오 제조사 레지스트리 _(slug: datalink)_

### ESC (1)
- `concepts/vendor-registry-esc.md` — 드론 ESC 제조사 레지스트리 _(slug: -esc)_

### FlightController (1)
- `concepts/vendor-registry-fc.md` — 드론 비행제어기 제조사 레지스트리 _(title: 비행제어기)_

### FlightStack (1)
- `concepts/software-registry-flight-stack.md` — 드론 비행 스택 SW 레지스트리 _(slug: flight-stack)_

### Frame (3)
- `concepts/kci-tank-zone-vulnerability-selective-counter-drone-protection.md` — 전차 기능구역별 취약도 평가 기반 선택적 대드론 방호 설계 프레임워크 (KCI) _(title: 프레임)_
- `concepts/llm-uav-carrier-tactical-agent.md` — 무인기 모함 LLM 기반 자율 전술 에이전트 프레임워크 _(title: 프레임)_
- `concepts/vendor-registry-frame.md` — 드론 프레임·완기체 제조사 레지스트리 _(slug: -frame)_

### GNSS (56)
- `concepts/ai-fl-uav-backdoor-gps-spoofing-jedrzejczak-2026.md` — Receiver-Domain Behavioral Probing for Backdoor-Re _(slug: gps)_
- `concepts/env-basler-usb3-2.4ghz-gps-note.md` — Possible Interference of the USB 3.0 Radio Frequen _(slug: gps)_
- `concepts/env-dlr-miniaturized-all-gnss-antenna-array-choke-ring-eucap-2021.md` — A Miniaturized All-GNSS Bands Antenna Array Incorp _(slug: gnss)_
- `concepts/env-henkel-anavs-uav-6d-rtk-antenna-eucap-2020.md` — Precise 6D RTK Positioning System for UAV-based Ne _(slug: rtk)_
- `concepts/env-kim-uav-airborne-multipath-jpnt-2015.md` — GNSS Airborne Multipath Error Modeling Under UAV P _(title: gnss)_
- `concepts/env-punzet-groundplane-rtk-uav-ars-2023.md` — Impact of Additional Antenna Groundplanes on RTK-G _(slug: rtk)_
- `concepts/env-recuv-gpsworld-uas-gnss-2016.md` — RECUV work highlighted in GPS World (UAS GNSS inte _(slug: gnss)_
- `concepts/env-usb3-gnss-emlid-forum-2017.md` — Problems with interference from USB3 hub (Emlid co _(slug: gnss)_
- `concepts/fusion-delama-galilean-gnss-delay-2605.13266.md` — Galilean State Estimation for Inertial Navigation  _(slug: gnss)_
- `concepts/fusion-suzuki-multi-gnss-receivers-uav-iros-2019.md` — Robust UAV Position and Attitude Estimation using  _(slug: gnss)_
- `concepts/fusion-wen-fgo-vs-ekf-2004.10572.md` — It is time for Factor Graph Optimization for GNSS/ _(title: gnss)_
- `concepts/gnss-denied-aeromap3d-2607.14009.md` — AeroMap3D: Anchoring Monocular UAV 6-DoF Localizat _(slug: gnss)_
- `concepts/gnss-denied-leo-fisher-emenonye-2502.06083.md` — Geolocation with Large LEO Constellations: Insight _(slug: gnss)_
- `concepts/gnss-denied-leo-jardak-2022.md` — The Potential of LEO Satellite-Based Opportunistic _(slug: gnss)_
- `concepts/gnss-denied-leo-survey-he-2025.md` — Survey on positioning technology based on signal o _(slug: gnss)_
- `concepts/gnss-denied-remote-autonomy.md` — GNSS-Denied Remote Autonomy for Small UAVs _(slug: gnss)_
- `concepts/gnss-denied-uwb-pena-queralta-2003.04380.md` — UWB-based system for UAV Localization in GNSS-Deni _(slug: gnss)_
- `concepts/gnss-denied-vio-novak-2602.01860.md` — Vision-only UAV State Estimation for Fast Flights  _(slug: gnss)_
- `concepts/gnss-engineering-hub.md` — 드론 GNSS 공학 자료 허브 _(slug: gnss)_
- `concepts/gnss-signals-beidou-navipedia.md` — BeiDou Signal Plan (Navipedia, ESA) _(slug: gnss)_
- `concepts/gnss-signals-galileo-navipedia.md` — Galileo Signal Plan (Navipedia, ESA) _(slug: gnss)_
- `concepts/gnss-signals-glonass-navipedia.md` — GLONASS Signal Plan (Navipedia, ESA) _(slug: gnss)_
- `concepts/gnss-signals-gps-navipedia.md` — GPS Signal Plan (Navipedia, ESA) _(slug: gnss)_
- `concepts/integrity-kass-design-insidegnss.md` — KASS: The Future of SBAS in Korea (Inside GNSS) _(title: gnss)_
- `concepts/integrity-raim-survey-huang-2025.md` — A survey of GNSS receiver autonomous integrity mon _(title: gnss)_
- `concepts/jamming-elaraby-hierarchical-dithered-null-steering-analog-crpa-2026.md` — Low-latency jamming mitigation in SWaP-constrained _(title: gnss)_
- `concepts/jamming-kci-yoo-resnet-svm-jamming-classification-kics-2023.md` — ResNet/SVM-Based GNSS Jamming Classification Schem _(title: gnss)_
- `concepts/jamming-kwon-null-steering-circular-array-jees-2018.md` — Null Steering of Circular Array Using Array Factor _(title: gps)_
- `concepts/jamming-novatel-grit-doc.md` — NovAtel GRIT - GNSS Resilience and Integrity Techn _(title: gnss)_
- `concepts/jamming-septentrio-aim-plus-jamming-protection-page.md` — AIM+ GNSS jamming protection (Septentrio 기술 해설: 노치 _(title: gnss)_
- `concepts/jamming-septentrio-jammertest-2023-results-page.md` — Most resilient GNSS receiver: results from JammerT _(title: gnss)_
- `concepts/jamming-spanghero-jammer-localization-2503.20352.md` — GNSS jammer localization and identification with a _(title: gnss)_
- `concepts/jamming-spanghero-uav-mapping-interference-2405.07611.md` — Uncovering GNSS Interference with Aerial Mapping U _(title: gnss)_
- `concepts/kci-dual-nis-sac-gnss-ins-spoofing.md` — 이중 NIS 보상 SAC 기반 GNSS/INS 무인기 은닉 기만 기법 (KCI) _(slug: gnss)_
- `concepts/korea-jamming-koreatimes-2024-11.md` — N. Korea jams GPS signals, affecting ships, civili _(title: gps)_
- `concepts/korea-jamming-segye-2024-11-cumulative.md` — 북한 GPS 전파 교란 올해까지 7000건 넘어 (세계일보) _(title: gps)_
- `concepts/korea-kci-kim-ngii-network-rtk-testbed-jpnt-2024.md` — Construction of Network RTK Testbed Using Referenc _(slug: rtk)_
- `concepts/korea-kci-lee-network-rtk-mountpoint-comparison-2026.md` — Comparative Analysis of GNSS Positioning Performan _(slug: rtk)_
- `concepts/korea-ngii-geodesy-portal-access-attempt-2026-10-22.md` — 국토지리정보원 GNSS 서비스포털 접근 시도 기록 (신청 절차 미확인) _(title: gnss)_
- `concepts/korea-ngii-geodesy-portal-service-list.md` — 국토지리정보원 GNSS 서비스포털 (geodesy.ngii.go.kr) 서비스 항목 _(title: gnss)_
- `concepts/korea-ngii-network-rtk-access-distributor-notice.md` — 국토지리정보원 네트워크 RTK(FKP) 이용안내 - 측량장비 유통사 게시글 (2차 출처) _(slug: rtk)_
- `concepts/korea-seoul-network-rtk-service-access.md` — 서울특별시 네트워크 RTK 시스템 접속 정보 (서울시 공식 페이지) _(slug: rtk)_
- `concepts/precise-kci-hwang-rtk-drone-river-survey-kosham-2024.md` — Analysis of Real-Time Kinematic Drones as a Replac _(slug: rtk)_
- `concepts/precise-kci-kim-rtk-precision-landing-iemek-2023.md` — Experiments of RTK based Precision Landing for Rot _(slug: rtk)_
- `concepts/precise-mirmohammadian-ztd-long-baseline-rtk-sensors-2022.md` — Multi-GNSS-Weighted Interpolated Tropospheric Dela _(slug: rtk)_
- `concepts/precise-ppk-rtk-ppp-ar-arkali-2025.md` — Accuracy Assessment of RTK, PPK, and PPP-AR Techni _(slug: rtk)_
- `concepts/precise-ppp-rtk-review-li-2022.md` — Review of PPP-RTK: achievements, challenges, and o _(slug: rtk)_
- `concepts/precise-stempfhuber-3d-rtk-single-gnss-receivers-isprs-2013.md` — 3D-RTK CAPABILITY OF SINGLE GNSS RECEIVERS _(slug: gnss)_
- `concepts/precise-wang-bds-gps-rtk-baseline-lengths-remote-sensing-2022.md` — Evaluation of BDS/GPS Multi-Frequency RTK Position _(slug: rtk)_
- `concepts/spoofing-kci-kim-cn0-detection-korea-jpnt-2026-1.md` — A Study on C/N0 Based GNSS Spoofing Detection Cons _(title: gnss)_
- `concepts/spoofing-kci-kim-cn0-detection-tle-jpnt-2026-3.md` — A Study on C/N0 Based GNSS Spoofing Detection Cons _(title: gnss)_
- `concepts/spoofing-kci-park-sac-covert-spoofing-uav-jpnt-2026.md` — SAC-Based Covert Spoofing Technique for GNSS/INS I _(title: gnss)_
- `concepts/vendor-registry-gnss-receivers.md` — 드론 GNSS 수신기·모듈·안테나 제품 레지스트리 _(slug: gnss)_
- `concepts/visual-slam-gps-denied-evaluation.md` — Visual SLAM GPS-Denied Evaluation _(slug: gps)_
- `concepts/vlm-fsm-copilot-uav-navigation.md` — FSM-VLM 하이브리드 UAV 항법: GPS 미사용 환경의 지연·신뢰성 분석 _(title: gps)_
- `entities/dji-matrice-350-rtk.md` — DJI Matrice 350 RTK와 Zenmuse H30T 운용 사양·사례 _(slug: rtk)_

### Gimbal (1)
- `concepts/hoverair-versa-2in1-2026.md` — HoverAir Versa 2-in-1 Gimbal Drone _(title: gimbal)_

### LiDAR (6)
- `concepts/drone-lidar-forest-boundary.md` — 드론 라이다를 이용한 임야 현황경계 추출 및 분석 _(slug: lidar)_
- `concepts/flight-ready-lidar-inertial-odometry.md` — Flight-Ready LiDAR-Inertial Odometry for Embedded  _(slug: lidar)_
- `concepts/kci-uav-lidar-ground-point-density-dem-accuracy.md` — UAV-LiDAR 지면점 밀도와 공간 해상도가 DEM 정확도에 미치는 영향 _(slug: lidar)_
- `concepts/kci-watershed-individual-tree-delineation-uav-lidar-chm.md` — UAV LiDAR CHM·그레이스케일 Watershed 개체목 분할 최적 조건 (KCI 2 _(slug: lidar)_
- `concepts/perception-energy-aware-uav-lidar-motion-planning.md` — 인지·에너지 인식 UAV 모션 계획 (이분산 불확실성 학습 모델) _(slug: lidar)_
- `concepts/vendor-registry-lidar.md` — 드론 LiDAR 제조사 레지스트리 _(slug: lidar)_

### Motor (2)
- `concepts/cyclic-mpdr-beamforming-uav-motor-noise.md` — cMPDR 빔포밍: 거의 주기정상 음향 간섭(UAV 모터) 억제 _(slug: motor)_
- `concepts/vendor-registry-motor.md` — 드론 모터 제조사 레지스트리 _(slug: motor)_

### Multirotor (12)
- `concepts/agile-quadrotor-learning.md` — Agile Quadrotor Flight Learning _(slug: quadrotor)_
- `concepts/ai-sim2real-gym-pybullet-drones-panerati-2021.md` — Learning to Fly -- a Gym Environment with PyBullet _(title: quadcopter)_
- `concepts/calos-lyapunov-safety-layer-quadrotor-rl.md` — CALOS: 쿼드로터 안전 강화학습을 위한 Control-Affine Lyapunov On _(slug: quadrotor)_
- `concepts/conv-energy-staging-jain-2020.md` — Staging energy sources to extend flight time of a  _(title: multirotor)_
- `concepts/e2e-fly-end-to-end-quadrotor.md` — E2E-Fly: End-to-End Quadrotor Autonomy System _(slug: quadrotor)_
- `concepts/kci-quadrotor-compound-fault-accommodation.md` — 쿼드로터 센서·구동기 복합 고장 보완 기법 (KCI) _(slug: quadrotor)_
- `concepts/quadrotor-wind-fidelity-ppo-robustness.md` — 쿼드로터 RL 제어의 학습 바람장 충실도 비교 (PPO vs PID/SE(3)) _(slug: quadrotor)_
- `concepts/rl-quadrotor-tunable-control.md` — RL-Based Quadrotor Control with Tunable Performanc _(slug: quadrotor)_
- `concepts/skyjepa-world-models.md` — SkyJEPA: Long-Horizon World Models for Quadrotor C _(title: quadrotor)_
- `concepts/spatial-dubins-quadrotor-control.md` — Spatial Dubins Airplane-Based Reference Smoothing  _(slug: quadrotor)_
- `concepts/temporal-cascading-quadrotor-mpc.md` — Temporal Cascading of Planning and Control for Qua _(slug: quadrotor)_
- `concepts/time-optimal-quadrotor-waypoints.md` — Time-Optimal Planning for Quadrotor Waypoint Fligh _(slug: quadrotor)_

### PX4 (7)
- `concepts/ai-latency-px4-offboard-afio-forum-2026.md` — [Release] AI Flight Integrity Observer: Measuring  _(slug: px4)_
- `concepts/ai-llm-drone-taking-flight-px4-lim-2025.md` — Taking Flight with Dialogue: Enabling Natural Lang _(slug: px4)_
- `concepts/data-flightlog-px4-analysis-tools.md` — Flight Log Analysis (PX4 User Guide) _(slug: px4)_
- `concepts/data-flightlog-px4-logging.md` — Logging (PX4 User Guide) _(slug: px4)_
- `concepts/data-flightlog-px4-ulog-format.md` — ULog File Format (PX4 User and Developer Guide) _(slug: px4)_
- `concepts/e-rocket-tvc-gnc-testbed.md` — E-Rocket: TVC 로켓 GNC 검증용 저가 테스트베드 (PX4 + ROS 2) _(title: px4)_
- `concepts/px4-simulation.md` — PX4 Simulation (SITL) _(slug: px4)_

### Payload (4)
- `concepts/multi-uav-payload-transport-rao-controllers.md` — 다중 UAV 페이로드 운송 제어 (Rao 외, 2022) _(slug: payload)_
- `concepts/payload-dependent-green-drone-routing.md` — 페이로드 의존 에너지 효율 드론 배송 경로 계획 _(slug: payload)_
- `concepts/uav-cable-payload-cooperative-transport-research.md` — 다중 UAV 케이블 매달림 페이로드 운송 연구 (센서·유도·입력성형) _(slug: payload)_
- `concepts/vendor-registry-payload-mech.md` — 드론 투하·윈치·낙하산 제조사 레지스트리 _(slug: payload)_

### Propeller (2)
- `concepts/pmsm-sensorless-controller-observer.md` — PMSM 센서리스 제어기-관측기 (UAV 프로펠러 적용) _(title: 프로펠러)_
- `concepts/vendor-registry-propeller.md` — 드론 프로펠러 제조사 레지스트리 _(slug: propeller)_

### ROS2 (6)
- `concepts/ai-latency-companion-fc-dds-vs-mavros-cotta-2023.md` — Latency Reduction and Packet Synchronization in Lo _(slug: mavros)_
- `concepts/conv-mbse-sysml-ros2-angadi-2026.md` — Model-Based Systems Engineering Framework for SysM _(slug: ros2)_
- `concepts/data-edge-aerial-autonomy-stack-panerati-2026.md` — aerial-autonomy-stack: a Faster-than-real-time, Au _(title: ros2)_
- `concepts/data-flightlog-rosbag2.md` — rosbag2 (ros2/rosbag2 GitHub README) _(title: ros2)_
- `concepts/data-sync-ros2-message-filters-approximatetime-source.md` — ros2/message_filters ApproximateTime: official doc _(slug: ros2)_
- `concepts/data-sync-ros2-message-filters-approximatetime.md` — message_filters ApproximateTime policy (ROS wiki m _(slug: ros2)_

### SwarmCoordinator (17)
- `concepts/addiff-gt-uav-swarm-self-healing.md` — AdDiff-GT: UAV 군집 네트워크 커버리지 보존 자가 복구 _(slug: swarm)_
- `concepts/calibrate-once-fly-any-team-swarm-training.md` — Calibrate Once, Fly Any Team — 저충실도 시뮬레이션 기반 드론 군집 _(slug: swarm)_
- `concepts/conv-swarm-agentic-edge-nguyen-2026.md` — Agentic AI Meets Edge Computing in Autonomous UAV  _(slug: swarm)_
- `concepts/conv-swarm-llm-rally-wang-2025.md` — RALLY: Role-Adaptive LLM-Driven Yoked Navigation f _(slug: swarm)_
- `concepts/distributed-aerial-surveillance-swarm.md` — Distributed Continuous Aerial Surveillance by UAS  _(slug: swarm)_
- `concepts/game-theoretic-drone-swarm-defense.md` — 게임이론 기반 드론 스웜 방어(차등 게임 응용 사례) _(slug: swarm)_
- `concepts/kci-llm-cbba-swarm-task-allocation.md` — LLM 전략 파라미터 생성 기반 상황 적응형 군집 무인기 임무 할당 _(slug: swarm)_
- `concepts/kci-mavlink-virtual-decoy-swarm-deception.md` — MAVLink 변조 기반 가상 디코이 군집 기만 시스템 _(slug: swarm)_
- `concepts/kci-uav-swarm-mission-reliability-abort.md` — 재구성형 UAV 스웜의 임무 중단을 고려한 임무 신뢰도 모델링 및 평가 _(slug: swarm)_
- `concepts/kci-uwb-degraded-uav-swarm-positioning.md` — UWB 품질 저하 환경에서 UAV 군집측위 최소운용조건 분석 (KCI) _(slug: swarm)_
- `concepts/llm-swarm-wot-framework.md` — LLM Swarm WoT Framework _(slug: swarm)_
- `concepts/recon-swarm-project.md` — Recon Swarm Project — 지능형 자율 군집정찰드론 _(slug: swarm)_
- `concepts/software-registry-swarm-multiagent.md` — 드론 군집·멀티에이전트 SW 레지스트리 _(slug: swarm)_
- `concepts/swarmnxt-aerial-swarm-platform.md` — SwarmNxt: 고속 애자일 공중 스웜을 위한 오픈소스 SW-HW 플랫폼 _(slug: swarm)_
- `concepts/uav-swarm-ai-trends-kci.md` — UAV 군집 AI 기술 동향: 인공지능 발전과 다중 에이전트 아키텍처의 진화 _(slug: swarm)_
- `concepts/uav-swarm-air-ground-isac.md` — 교차 지역 협력 기반 Air-Ground ISAC UAV 군집 _(slug: swarm)_
- `concepts/uav-swarm-target-localization.md` — UAV Swarm Target Localization via Detection-Aided  _(slug: swarm)_

## 등급 B — 문서별 검토 (66건)

### ArduPilot (7)
- `comparisons/fc-firmware-comparison.md` — FPV 드론 FC 펌웨어 비교: Betaflight vs INAV vs ArduPilot _(title: ardupilot)_
- `concepts/ai-latency-ardupilot-companion-uart-baud-dade-2026.md` — ArduPilot MAVLink telemetry reliability and latenc _(slug: ardupilot)_
- `concepts/data-latency-px4-ardupilot-loop-rates-official.md` — PX4 / ArduPilot official docs: loop rates, offboar _(slug: ardupilot)_
- `concepts/data-latency-px4-ardupilot-rates-delays-params-source.md` — PX4 and ArduPilot source docs: control loop rates, _(slug: ardupilot)_
- `concepts/fusion-ardupilot-ekf3-gps-overview.md` — ArduPilot EKF3 overview: GPS usage parameters (Ard _(slug: ardupilot)_
- `concepts/jamming-ardupilot-ekf3-jamming-expected-doc.md` — ArduPilot GPS Jamming Mediation (EK3_OPTIONS Jammi _(slug: ardupilot)_
- `concepts/ros2-drone-deep.md` — ROS2 Drone Integration Deep — PX4/ArduPilot 연동 상세 _(title: ardupilot)_

### Battery (2)
- `concepts/conv-energy-flying-batteries-jain-2019.md` — Flying batteries: In-flight battery switching to i _(title: battery)_
- `concepts/kci-lidar-slam-indoor-battery-monitoring-iot-uav.md` — LiDAR-SLAM 기반 실내 배터리 모니터링 IoT-UAV 플랫폼 (KCI) _(slug: battery)_

### Camera (6)
- `concepts/ai-sync-camera-imu-online-temporal-calibration-qin-2018.md` — Online Temporal Calibration for Monocular Visual-I _(slug: camera)_
- `concepts/ai-sync-camera-imu-varying-time-offset-ling-2018.md` — Modeling Varying Camera-IMU Time Offset in Optimiz _(slug: camera)_
- `concepts/gps-uav-imu.md` — GPS 미수신 환경에 특화된 마이크로드론/UAV 위치추정 기법들은 공통적으로 외부 위치 인 _(title: 카메라)_
- `concepts/hoverair-versa.md` — HoverAir Versa: 짐벌-드론 하이브리드 카메라 _(title: 카메라)_
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(title: 카메라)_
- `concepts/vendor-registry-camera.md` — 드론 카메라·짐벌 제조사 레지스트리 _(slug: camera)_

### ESC (1)
- `concepts/bldc-motor-esc-characterization-research.md` — BLDC 모터·ESC 특성 측정·모델링 연구 (효율·열·추력 모델) _(slug: -esc)_

### FixedWing (2)
- `concepts/inav-fixed-wing-servo-direction-checklist.md` — INAV 고정익 서보 방향 오류 3단계 점검 _(slug: fixed-wing)_
- `concepts/propeller-feedback-airspeed-estimation.md` — 프로펠러 피드백만으로 고정익 대기속도 추정 (Ntouros 외, 2025) _(title: 고정익)_

### FlightController (1)
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(slug: pixhawk)_

### FlightStack (4)
- `comparisons/fc-firmware-comparison.md` — FPV 드론 FC 펌웨어 비교: Betaflight vs INAV vs ArduPilot _(title: betaflight)_
- `concepts/inav-fixed-wing-servo-direction-checklist.md` — INAV 고정익 서보 방향 오류 3단계 점검 _(slug: inav)_
- `concepts/px4-flight-modes.md` — PX4 Flight Modes _(slug: px4-flight)_
- `entities/px4-flight-stack.md` — PX4 Flight Stack _(slug: flight-stack)_

### Frame (2)
- `concepts/autotrans-uav-suspended-payload-planning-control.md` — AutoTrans: 현수 페이로드 UAV 계획·제어 프레임워크 _(title: 프레임)_
- `concepts/oddityrc-echo5-frame-gps.md` — OddityRC Echo5 5인치 프레임·마이크로 GPS·ELRS 수신기 _(slug: -frame)_

### GNSS (10)
- `concepts/data-sync-hardware-timestamp-ntnu-wiki-and-gnss-clock.md` — Hardware timestamping for drone sensors: NTNU Time _(slug: gnss)_
- `concepts/decentralized-swarm-gps-denied.md` — Decentralized UAV Swarms in GPS/Communication-Deni _(slug: gps)_
- `concepts/fusion-ardupilot-ekf3-gps-overview.md` — ArduPilot EKF3 overview: GPS usage parameters (Ard _(slug: gps)_
- `concepts/fusion-px4-ekf2-gnss-handling.md` — PX4 EKF2 tuning: GNSS fusion control, quality gate _(slug: gnss)_
- `concepts/gps-uav-imu.md` — GPS 미수신 환경에 특화된 마이크로드론/UAV 위치추정 기법들은 공통적으로 외부 위치 인 _(slug: gps)_
- `concepts/jamming-ardupilot-ekf3-jamming-expected-doc.md` — ArduPilot GPS Jamming Mediation (EK3_OPTIONS Jammi _(title: gps)_
- `concepts/oddityrc-echo5-frame-gps.md` — OddityRC Echo5 5인치 프레임·마이크로 GPS·ELRS 수신기 _(slug: gps)_
- `concepts/rigid-covert-gnss-spoofing-swarm.md` — Rigid-Covert GNSS Spoofing: UAV 군집의 구조적 탐지 사각지대 _(slug: gnss)_
- `concepts/spoofing-jung-px4-ekf-drl-2506.08445.md` — GPS Spoofing Attacks on AI-based Navigation System _(title: gps)_
- `concepts/vendor-registry-gnss-imu.md` — 드론 GNSS·IMU·센서 제조사 레지스트리 _(slug: gnss)_

### Gimbal (2)
- `concepts/hoverair-versa.md` — HoverAir Versa: 짐벌-드론 하이브리드 카메라 _(title: 짐벌)_
- `concepts/vendor-registry-camera.md` — 드론 카메라·짐벌 제조사 레지스트리 _(title: 짐벌)_

### IMU (5)
- `concepts/ai-sync-camera-imu-online-temporal-calibration-qin-2018.md` — Online Temporal Calibration for Monocular Visual-I _(slug: imu)_
- `concepts/ai-sync-camera-imu-varying-time-offset-ling-2018.md` — Modeling Varying Camera-IMU Time Offset in Optimiz _(slug: imu)_
- `concepts/gps-uav-imu.md` — GPS 미수신 환경에 특화된 마이크로드론/UAV 위치추정 기법들은 공통적으로 외부 위치 인 _(slug: imu)_
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(slug: imu)_
- `concepts/vendor-registry-gnss-imu.md` — 드론 GNSS·IMU·센서 제조사 레지스트리 _(slug: imu)_

### LiDAR (3)
- `concepts/data-sync-hardware-timestamp-ntnu-wiki-and-gnss-clock.md` — Hardware timestamping for drone sensors: NTNU Time _(title: lidar)_
- `concepts/kci-lidar-slam-indoor-battery-monitoring-iot-uav.md` — LiDAR-SLAM 기반 실내 배터리 모니터링 IoT-UAV 플랫폼 (KCI) _(slug: lidar)_
- `concepts/micro-drone-slam-imu-vio-lidar-uav-livox-mid-360-pixhawk-4-m.md` — 검색 결과에서 "micro drone"으로 명시된 SLAM 사례는 카메라+IMU(VIO)  _(slug: lidar)_

### Motor (2)
- `concepts/bldc-motor-esc-characterization-research.md` — BLDC 모터·ESC 특성 측정·모델링 연구 (효율·열·추력 모델) _(slug: motor)_
- `concepts/bldc-motor-propeller-digital-twin-static-thrust.md` — BLDC 모터-프로펠러 디지털 트윈: 정지 추력 예측 (Gauthier 외, 2023) _(slug: motor)_

### Multirotor (2)
- `concepts/conv-energy-flying-batteries-jain-2019.md` — Flying batteries: In-flight battery switching to i _(title: multirotor)_
- `concepts/multirotor-propeller-test-research.md` — 프로펠러 성능 시험·측정 연구 (벤치, 저 Re, 덕티드 동축) _(slug: multirotor)_

### PX4 (7)
- `concepts/data-latency-px4-ardupilot-loop-rates-official.md` — PX4 / ArduPilot official docs: loop rates, offboar _(slug: px4)_
- `concepts/data-latency-px4-ardupilot-rates-delays-params-source.md` — PX4 and ArduPilot source docs: control loop rates, _(slug: px4)_
- `concepts/fusion-px4-ekf2-gnss-handling.md` — PX4 EKF2 tuning: GNSS fusion control, quality gate _(slug: px4)_
- `concepts/px4-flight-modes.md` — PX4 Flight Modes _(slug: px4)_
- `concepts/ros2-drone-deep.md` — ROS2 Drone Integration Deep — PX4/ArduPilot 연동 상세 _(title: px4)_
- `concepts/spoofing-jung-px4-ekf-drl-2506.08445.md` — GPS Spoofing Attacks on AI-based Navigation System _(slug: px4)_
- `entities/px4-flight-stack.md` — PX4 Flight Stack _(slug: px4)_

### Payload (1)
- `concepts/autotrans-uav-suspended-payload-planning-control.md` — AutoTrans: 현수 페이로드 UAV 계획·제어 프레임워크 _(slug: payload)_

### Propeller (3)
- `concepts/bldc-motor-propeller-digital-twin-static-thrust.md` — BLDC 모터-프로펠러 디지털 트윈: 정지 추력 예측 (Gauthier 외, 2023) _(slug: propeller)_
- `concepts/multirotor-propeller-test-research.md` — 프로펠러 성능 시험·측정 연구 (벤치, 저 Re, 덕티드 동축) _(slug: propeller)_
- `concepts/propeller-feedback-airspeed-estimation.md` — 프로펠러 피드백만으로 고정익 대기속도 추정 (Ntouros 외, 2025) _(slug: propeller)_

### ROS2 (1)
- `concepts/ros2-drone-deep.md` — ROS2 Drone Integration Deep — PX4/ArduPilot 연동 상세 _(slug: ros2)_

### SwarmCoordinator (3)
- `concepts/decentralized-swarm-gps-denied.md` — Decentralized UAV Swarms in GPS/Communication-Deni _(slug: swarm)_
- `concepts/kci-vtol-swarm-takeoff-landing-operation.md` — 다수 VTOL 무인기 군집비행 이착륙 운용방안 (KCI) _(slug: swarm)_
- `concepts/rigid-covert-gnss-spoofing-swarm.md` — Rigid-Covert GNSS Spoofing: UAV 군집의 구조적 탐지 사각지대 _(slug: swarm)_

### Telemetry (1)
- `concepts/ai-latency-ardupilot-companion-uart-baud-dade-2026.md` — ArduPilot MAVLink telemetry reliability and latenc _(title: telemetry)_

### VTOL (1)
- `concepts/kci-vtol-swarm-takeoff-landing-operation.md` — 다수 VTOL 무인기 군집비행 이착륙 운용방안 (KCI) _(slug: vtol)_

