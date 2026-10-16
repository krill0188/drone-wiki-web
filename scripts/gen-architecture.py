# 기본구조 온톨로지 원본(저자 정의 설계 지식). 사용: python3 scripts/gen-architecture.py data/ontology/architecture.json
import json, sys
OUT = sys.argv[1]

D = {  # 공학 분야
 "MECH": "기계공학", "ELEC": "전기공학", "COM": "통신공학", "CS": "컴퓨터공학", "MECHA": "메카트로닉스",
 "SWE": "SW공학", "CTRL": "제어공학", "ROS": "ROS/ROS2", "AI": "AI/인지",
}

# 능력(capability): id → 이름
CAP = {
 "airframe_structure":"기체 구조","thrust_generation":"추력 생성","motor_drive":"모터 구동","power_supply":"전원 공급","battery_protection":"배터리 보호",
 "power_distribution":"전원 분배·강압","attitude_estimation":"자세 측정(IMU)","altitude_estimation":"고도 측정","heading_estimation":"방위 측정",
 "position_gnss":"GNSS 위치","gnss_correction":"GNSS 보정(RTK)","position_local":"저고도 국소 위치(광류/거리)","position_nongnss":"비GNSS 위치추정(VIO/SLAM)",
 "state_estimation":"상태추정 융합(EKF)","flight_control":"비행제어","navigation_planning":"경로·항법 계획","occupancy_mapping":"점유지도 작성",
 "visual_sensing":"가시광 영상","thermal_sensing":"열화상","sensor_stabilization":"센서 안정화(짐벌)","ranging_3d":"3D 거리측정(LiDAR)",
 "ranging_all_weather":"전천후 거리측정(레이더)","near_obstacle":"근접 장애물 감지","compute_edge":"온보드 연산","ai_acceleration":"AI 가속",
 "target_perception":"표적 인식(DL)","target_tracking":"표적 추적","mission_management":"임무 관리","onboard_middleware":"온보드 미들웨어(ROS2/DDS)",
 "fc_ros_bridge":"FC↔ROS2 브릿지","command_link":"지휘통제(C2) 링크","telemetry_link":"텔레메트리 링크","video_link":"영상 링크","mesh_networking":"메시 네트워킹",
 "wan_link":"광역망 링크(LTE/5G)","global_link":"위성 링크","video_streaming":"영상 스트리밍 처리","rf_radiation":"안테나·RF 복사","time_sync":"시간 동기",
 "relative_localization":"상대 위치추정","swarm_coordination":"군집 조정","task_allocation":"임무 할당","link_security":"링크 보안","ground_control":"지상통제",
 "payload_release":"투하","payload_lowering":"윈치 하강·인양","safety_recovery":"안전 회수(낙하산)","safety_failsafe":"안전 장치·페일세이프","simulation_test":"시뮬레이션·시험",
 "regulatory":"법규 준수(원격식별 등)","thermal_management":"열관리","vibration_isolation":"진동 절연",
}

# 구성요소: id, 이름, 계층, 분야, 제공 능력, 요구 능력("a|b"=택1), 비고
C = [
 ("frame","기체 프레임","HW",["MECH"],["airframe_structure"],[],"카본/알루미늄, 진동 모드·강성이 센서 품질에 영향"),
 ("propeller","프로펠러","HW",["MECH"],["thrust_generation"],[],"직경·피치·재질; 팁속도 한계"),
 ("motor","BLDC 모터","HW",["MECH","ELEC","MECHA"],["thrust_generation"],["motor_drive"],"kV·최대전류·정격 S수"),
 ("esc","ESC","HW+SW",["ELEC","MECHA"],["motor_drive"],["power_distribution","flight_control"],"DShot/PWM 신호, 펌웨어(BLHeli/AM32), 전류·열 한계"),
 ("battery","배터리 팩","HW",["ELEC"],["power_supply"],[],"S수·용량·C율·에너지밀도"),
 ("bms","BMS","HW+SW",["ELEC","SWE"],["battery_protection"],["power_supply"],"스마트 배터리는 SMBus/CAN 텔레메트리"),
 ("pdb_bec","PDB/BEC(강압)","HW",["ELEC"],["power_distribution"],["power_supply"],"센서·컴퓨터 전원 노이즈 분리"),
 ("imu","IMU","HW",["ELEC","MECHA"],["attitude_estimation"],[],"자이로/가속도; 진동·온도 드리프트"),
 ("baro","기압계","HW",["ELEC"],["altitude_estimation"],[],"프롭워시·온도 영향"),
 ("mag","지자기계","HW",["ELEC"],["heading_estimation"],[],"전류·ESC 자기 간섭에 취약"),
 ("gnss","GNSS 수신기","HW",["COM","ELEC"],["position_gnss"],["rf_radiation"],"재밍·스푸핑 취약"),
 ("rtk_base","RTK 기지국/NTRIP","HW+SW",["COM"],["gnss_correction"],["wan_link|telemetry_link"],"보정 데이터 링크 필요"),
 ("optflow_rf","광류+거리센서","HW",["ELEC","MECHA"],["position_local"],[],"저고도·질감 있는 바닥 한정"),
 ("ekf","EKF 상태추정","SW",["CTRL","SWE"],["state_estimation"],["attitude_estimation","altitude_estimation","position_gnss|position_nongnss|position_local"],"PX4 EKF2/ArduPilot EKF3, 센서 융합·이상치 거부"),
 ("fc","비행제어기(FC)","HW+SW",["CTRL","ELEC","SWE"],["flight_control"],["state_estimation","power_distribution","motor_drive"],"PX4/ArduPilot 펌웨어, 제어 루프 수백Hz~kHz"),
 ("camera_eo","EO 카메라","HW",["ELEC","CS"],["visual_sensing"],["power_distribution"],"해상도·FOV·셔터(글로벌/롤링)"),
 ("camera_ir","IR(열화상) 카메라","HW",["ELEC","CS"],["thermal_sensing"],["power_distribution"],"비냉각 마이크로볼로미터; 해상도 낮음, 규제(수출) 확인"),
 ("gimbal","짐벌","HW+SW",["MECHA","CTRL"],["sensor_stabilization"],["power_distribution"],"3축 안정화, 진동 절연 겸함"),
 ("lidar","LiDAR","HW",["ELEC","MECH"],["ranging_3d"],["power_distribution"],"고정밀 3D, 비·안개·분진에 성능 저하, 질량·전력 큼"),
 ("radar","mmWave 레이더","HW",["COM","ELEC"],["ranging_all_weather","near_obstacle"],["power_distribution"],"비·연기·야간에 강함, 해상도 낮음"),
 ("tof_us","ToF/초음파","HW",["ELEC"],["near_obstacle"],[],"근거리 충돌 회피"),
 ("companion","컴패니언 컴퓨터","HW",["CS","ELEC"],["compute_edge"],["power_distribution"],"Jetson/RPi/x86; 전력·발열 큼"),
 ("npu","AI 가속기(GPU/NPU)","HW",["CS","AI"],["ai_acceleration"],["compute_edge"],"추론 지연·전력 트레이드오프"),
 ("vio","VIO/Visual SLAM","SW",["CS","AI","CTRL"],["position_nongnss"],["visual_sensing","attitude_estimation","compute_edge"],"스케일·드리프트, 저조도·무질감에 취약"),
 ("lidar_slam","LiDAR SLAM","SW",["CS","CTRL"],["position_nongnss","occupancy_mapping"],["ranging_3d","attitude_estimation","compute_edge"],"기하 퇴화(복도·터널) 주의"),
 ("mapper","점유지도(Octomap/ESDF)","SW",["CS"],["occupancy_mapping"],["ranging_3d|visual_sensing","state_estimation","compute_edge"],""),
 ("planner","경로/궤적 계획","SW",["CS","CTRL","ROS"],["navigation_planning"],["state_estimation","occupancy_mapping","onboard_middleware"],"Nav2/Ego-Planner/MoveIt류"),
 ("dl_perception","딥러닝 인식(YOLO 등)","SW",["AI","CS"],["target_perception"],["visual_sensing|thermal_sensing","ai_acceleration"],"학습 데이터 분포 밖(야간·열화상)에서 성능 저하"),
 ("tracker","표적 추적기","SW",["AI","CTRL"],["target_tracking"],["target_perception","sensor_stabilization"],"짐벌·기체 시선제어 결합"),
 ("mission_mgr","임무 관리자","SW",["SWE","ROS"],["mission_management"],["flight_control","navigation_planning"],"상태기계/BT, 페일세이프 연동"),
 ("ros2","ROS2 미들웨어","SW",["ROS","CS","SWE"],["onboard_middleware"],["compute_edge"],"DDS QoS·도메인 분리, 무선 구간 디스커버리 트래픽 주의"),
 ("xrce","micro-XRCE-DDS/MAVROS 브릿지","SW",["ROS","SWE"],["fc_ros_bridge"],["onboard_middleware","flight_control"],"PX4 uORB↔ROS2 / MAVLink↔ROS"),
 ("radio_c2","C2 라디오(ELRS/CRSF 등)","HW+SW",["COM"],["command_link"],["rf_radiation"],"저지연 소용량, 900MHz/2.4GHz"),
 ("radio_telem","텔레메트리 라디오(SiK 등)","HW+SW",["COM"],["telemetry_link"],["rf_radiation"],"MAVLink 중계, 소용량"),
 ("radio_video","영상 송신(아날로그/디지털)","HW",["COM"],["video_link"],["rf_radiation","visual_sensing|thermal_sensing"],"5.8GHz 중심, 지연/화질 트레이드오프"),
 ("radio_mesh","IP 메시/MANET 라디오","HW+SW",["COM","CS"],["mesh_networking","video_link","telemetry_link"],["rf_radiation","link_security"],"인프라 불요, 다중 노드, 중량·전력 큼"),
 ("modem_lte","LTE/5G 모뎀","HW+SW",["COM"],["wan_link"],["rf_radiation"],"기지국 인프라 의존, 재난·원거리에서 두절 가능"),
 ("satcom","위성 링크","HW+SW",["COM"],["global_link"],["rf_radiation"],"지연 큼·대역 작음(SBD)~대역 큰 LEO 단말"),
 ("antenna","안테나","HW",["COM","MECH"],["rf_radiation"],[],"이득·편파·장착 위치(기체 차폐), 다이버시티"),
 ("uwb","UWB 거리측정","HW",["COM","ELEC"],["relative_localization"],["rf_radiation"],"기체 간/앵커 간 거리, GNSS 없이 군집 상대위치"),
 ("vid_pipeline","영상 파이프라인(GStreamer/RTSP)","SW",["CS","SWE"],["video_streaming"],["video_link","visual_sensing|thermal_sensing"],"코덱·비트레이트 적응"),
 ("time_sync","시간 동기(PTP/chrony/PPS)","SW",["CS","COM"],["time_sync"],[],"다기체 센서융합·로그 정렬 필수"),
 ("sec","링크 보안(암호·인증)","SW",["SWE","COM"],["link_security"],[],"MAVLink2 서명, TLS/AES, 키 배포"),
 ("swarm_ctrl","군집 제어(편대/합의)","SW",["CTRL","CS","ROS"],["swarm_coordination"],["mesh_networking","relative_localization","time_sync","state_estimation"],"중앙집중 vs 분산, 통신 두절 시 폴백"),
 ("task_alloc","임무 할당(경매/최적화)","SW",["CS","AI"],["task_allocation"],["mesh_networking","mission_management"],""),
 ("failsafe","페일세이프 관리","SW",["SWE","CTRL"],["safety_failsafe"],["command_link|telemetry_link","state_estimation"],"링크 상실·저전압·지오펜스 정책"),
 ("gcs","지상통제(GCS)","HW+SW",["SWE","CS"],["ground_control"],["telemetry_link|mesh_networking|wan_link"],"QGC/Mission Planner/사용자 GCS"),
 ("rid","원격식별/법규 모듈","HW+SW",["COM","SWE"],["regulatory"],["rf_radiation"],"국가별 요건 확인"),
 ("release","투하 기구(서보/전자)","HW+SW",["MECHA","MECH"],["payload_release"],["flight_control"],"무게중심 변화·릴리스 신뢰성"),
 ("winch","윈치","HW+SW",["MECHA","MECH"],["payload_lowering"],["flight_control"],"하강 중 진동·스윙, 인명 구조용"),
 ("parachute","낙하산 회수","HW",["MECH"],["safety_recovery"],[],"트리거 로직과 고도 하한"),
 ("sim","SITL/Gazebo 시뮬","SW",["SWE","ROS"],["simulation_test"],[],"HIL/SITL로 규칙·군집 로직 검증"),
 ("thermal_mgmt","열관리(방열/팬)","HW",["MECH","ELEC"],["thermal_management"],[],"컴퓨터·ESC·배터리 발열"),
 ("damper","진동 절연","HW",["MECH"],["vibration_isolation"],[],"IMU/카메라 마운트"),
]

# 통신 링크(일반 범위 — 제품별 상이)
LINKS = [
 ("sub1g_telem","900MHz급 텔레메트리/ELRS-900",900,0.05,[5,40],[20,100],True,False,"저대역·장거리·투과 우수. 영상 불가. 국내 허용 대역/출력 법규 확인"),
 ("elrs_24","2.4GHz C2(ELRS 등)",2400,0.1,[1,15],[5,30],True,False,"저지연 조종. 2.4GHz 혼잡"),
 ("wifi","Wi-Fi(2.4/5GHz)",5800,50,[0.1,1],[5,50],True,False,"짧은 거리 고대역. 이동 시 핸드오버 불안정"),
 ("video_58","5.8GHz 영상(아날로그/디지털)",5800,10,[1,10],[20,60],True,False,"영상 중심. 자유공간 손실 큼, 장애물에 약함"),
 ("mesh_manet","COFDM/MANET 메시(1.x~2.x GHz)",2400,20,[5,30],[20,100],True,True,"인프라 불요·다중노드·멀티홉. 중량·전력 큼, 대역은 홉 수·노드 수에 반비례"),
 ("lte5g","LTE/5G 셀룰러",1800,30,[0,50],[30,120],False,True,"기지국 있는 곳에서 광역. 재난·산악·해상에서 두절. 고도 상승 시 셀 간섭"),
 ("satcom","위성(Iridium SBD/LEO)",1600,0.01,[1000,40000],[1000,10000],True,False,"전 지구 도달. 대역·지연 열악(SBD), LEO 단말은 대역 개선하나 중량·전력 큼"),
]

# 프로토콜 어댑터 그래프: (a, b, 어댑터, 신뢰도)
PROTO = ["MAVLink","ROS2/DDS","ROS1","uORB(PX4)","DroneCAN","CRSF/SBUS","CoT(ATAK)","STANAG4586","RTSP/RTP","MQTT","Zenoh","WebSocket(rosbridge)","DJI-SDK","OpenDroneID"]
ADAPT = [
 ("uORB(PX4)","ROS2/DDS","micro-XRCE-DDS (px4_ros_com)","표준"),
 ("MAVLink","ROS2/DDS","MAVROS / mavlink 패키지","표준"),
 ("MAVLink","ROS1","MAVROS (ROS1)","표준"),
 ("ROS1","ROS2/DDS","ros1_bridge","표준"),
 ("ROS2/DDS","Zenoh","zenoh-bridge-ros2dds","표준"),
 ("ROS2/DDS","WebSocket(rosbridge)","rosbridge_suite","표준"),
 ("ROS2/DDS","MQTT","mqtt_client 등 브릿지 노드","커뮤니티"),
 ("MAVLink","CoT(ATAK)","MAVLink→CoT 게이트웨이","커뮤니티/상용"),
 ("MAVLink","STANAG4586","VSM(Vehicle Specific Module) 개발 필요","상용·맞춤"),
 ("DroneCAN","MAVLink","FC의 DroneCAN 노드 ↔ MAVLink (FC 내장)","표준"),
 ("MAVLink","OpenDroneID","FC/RID 모듈 내장 메시지","표준"),
 ("CRSF/SBUS","MAVLink","FC의 RC 입력 처리·CRSF 텔레메트리 변환","표준"),
 ("MAVLink","DJI-SDK","직접 변환 없음 → ROS2 중계 + DJI OSDK/MSDK 브릿지 맞춤 개발","맞춤"),
 ("RTSP/RTP","ROS2/DDS","image_transport/gscam 노드","표준"),
]

# 결합(커플링) 그래프: (원인, 결과, 분야들, 이유)
CPL = [
 ("payload_mass","hover_power",["MECH","ELEC"],"추력 요구 ↑ → 호버링 전력 ∝ T^1.5"),
 ("hover_power","flight_time",["ELEC"],"에너지 일정 → 비행시간 ↓"),
 ("hover_power","esc_motor_heat",["ELEC","MECH"],"전류 ↑ → 구동계 발열 ↑"),
 ("payload_mass","frame_stress",["MECH"],"하중 ↑ → 굽힘·고유진동수 변화"),
 ("frame_stress","vibration",["MECH"],"공진 근접 시 진동 ↑"),
 ("vibration","imu_noise",["MECHA","ELEC"],"IMU 진동 정류·클리핑"),
 ("imu_noise","ekf_drift",["CTRL"],"혁신 증가·자세/위치 드리프트"),
 ("vibration","image_blur",["MECHA","CS"],"카메라/짐벌 흔들림 → 블러"),
 ("image_blur","vio_loss",["CS","AI"],"특징점 추적 실패"),
 ("gnss_denied","need_nongnss",["CTRL","CS"],"GNSS 상실 → VIO/LiDAR SLAM/UWB 필요"),
 ("need_nongnss","compute_load",["CS"],"SLAM·인식 연산 ↑"),
 ("compute_load","power_draw",["ELEC"],"컴퓨터 전력 ↑"),
 ("power_draw","flight_time",["ELEC"],"보조 전력도 비행시간 감소"),
 ("compute_load","soc_heat",["ELEC","MECH"],"발열 ↑(밀폐·고온에서 심화)"),
 ("soc_heat","thermal_throttle",["CS"],"클럭 다운"),
 ("thermal_throttle","inference_latency",["AI","CS"],"추론/SLAM 지연 ↑"),
 ("inference_latency","control_delay",["CTRL"],"인지→제어 루프 지연 → 안정성·추종 저하"),
 ("video_bitrate","link_bw_demand",["COM"],"영상 비트레이트 ↑ → 링크 대역 요구 ↑"),
 ("link_bw_demand","range_loss",["COM"],"고대역 변조 필요 → 수신감도 악화 → 도달거리 ↓"),
 ("range","fspl_loss",["COM"],"자유공간 손실 ∝ 20log(d)+20log(f)"),
 ("fspl_loss","link_margin_low",["COM"],"링크 마진 ↓ → 패킷 손실·끊김"),
 ("link_margin_low","failsafe_trigger",["SWE","CTRL"],"링크 상실 → RTL/착륙 발동"),
 ("tx_power","power_draw",["ELEC"],"RF 송신 전력 ↑ → 전류 ↑"),
 ("tx_power","emi",["COM","ELEC"],"전자기 간섭 ↑"),
 ("emi","mag_gnss_noise",["ELEC"],"지자기·GNSS 수신 간섭"),
 ("hover_power","mag_gnss_noise",["ELEC"],"대전류 배선의 자계 ↑ → 지자기 오염(배선 트위스트·거리 확보 필요)"),
 ("swarm_size","mesh_traffic",["COM","CS"],"방송 트래픽 ∝ N² (설계 따라)"),
 ("mesh_traffic","latency",["COM"],"혼잡 → 지연·패킷 손실 ↑"),
 ("latency","formation_instability",["CTRL"],"지연된 상대상태 → 편대 진동/충돌 위험"),
 ("swarm_size","dds_discovery",["ROS","CS"],"DDS 디스커버리·노드 수 ↑ → 무선 구간 트래픽 폭증"),
 ("dds_discovery","latency",["ROS","COM"],"디폴트 멀티캐스트 설정 시 지연 ↑ (Zenoh/디스커버리 서버로 완화)"),
 ("time_offset","fusion_error",["CS","CTRL"],"다기체 시간 불일치 → 상대위치 오차"),
 ("gnss_denied","relative_loc_loss",["CTRL"],"군집 상대위치 상실 → UWB/상호 시각검출 필요"),
 ("relative_loc_loss","formation_instability",["CTRL"],"상대위치 불확실 → 충돌 위험"),
 ("cold","battery_resistance",["ELEC"],"저온 내부저항 ↑"),
 ("battery_resistance","voltage_sag",["ELEC"],"부하 시 전압 강하 ↑"),
 ("voltage_sag","brownout_risk",["ELEC","CTRL"],"저전압 컷오프·컴퓨터 리셋"),
 ("voltage_sag","flight_time",["ELEC"],"가용 용량 ↓"),
 ("altitude","air_density_low",["MECH"],"고도 ↑ → 공기밀도 ↓"),
 ("air_density_low","hover_power",["MECH","ELEC"],"추력 유지에 회전수↑ → 전력 ↑"),
 ("rain_fog","lidar_degrade",["ELEC"],"산란 → 거리측정 열화"),
 ("rain_fog","eo_degrade",["CS"],"가시도 ↓"),
 ("rain_fog","radar_robust",["COM"],"mmWave는 상대적으로 견딤(해상도 한계)"),
 ("night","eo_degrade",["CS"],"저조도 → EO·VIO 열화 → 열화상/LiDAR 필요"),
 ("eo_degrade","vio_loss",["CS","AI"],"저조도/연무에서 VIO 추적 실패"),
 ("eo_degrade","detect_miss",["AI"],"표적 미검출 ↑"),
 ("wind","hover_power",["MECH","ELEC"],"자세 유지 보정 ↑"),
 ("wind","position_error",["CTRL"],"외란 → 위치 오차(투하 정확도 ↓)"),
 ("payload_drop","cg_shift",["MECH","MECHA"],"투하 직후 무게중심·질량 급변"),
 ("cg_shift","attitude_transient",["CTRL"],"자세 과도응답 → 제어 게인 스케줄링 필요"),
]

# 커플링 요인 감지 키워드
FACTORS = {
 "payload_mass": r"페이로드|탑재.{0,3}(중량|무게)|무거|중량 증가|payload",
 "gnss_denied": r"non.?gps|비.?gps|gps.?(없|불가|거부|음영)|gnss.?denied|재밍|스푸핑|터널|실내|지하",
 "swarm_size": r"군집|swarm|다수.{0,3}(기체|드론)|\d+\s*대",
 "video_bitrate": r"영상|fpv|스트리밍|4k|1080|fhd",
 "tx_power": r"송신.?출력|tx.?power|출력\s*\d+\s*(mw|w)",
 "range": r"원거리|장거리|\d+\s*km|가시권 ?밖|bvlos",
 "cold": r"저온|한파|겨울|영하",
 "altitude": r"고지대|해발|고고도|고도 ?(가 )?(높|상승)",
 "rain_fog": r"비\b|우천|안개|연기|분진|연무",
 "night": r"야간|밤|저조도",
 "wind": r"바람|강풍|돌풍|풍속",
 "payload_drop": r"투하|살포|낙하",
 "compute_load": r"slam|vio|딥러닝|추론|yolo|인공지능|\bai\b|온보드 ?연산",
 "time_offset": r"시간 ?동기|ptp|chrony|타임스탬프",
}

# 기본구조 주제(topic): id, 이름, 별칭정규식, 구성요소, 서술
T = [
 ("drone","드론 기본구조",r"드론.{0,6}(기본|구조|구성)|기체 구조|drone architecture",["frame","propeller","motor","esc","battery","pdb_bec","fc","imu","gnss","radio_c2","companion","gcs"],"추진계(모터-ESC-프롭) ← 전원(배터리-PDB) / 제어(FC+IMU+EKF) / 항법(GNSS) / 통신(C2·텔레메트리) / 임무(컴패니언·페이로드)"),
 ("vision","비전 기본구조",r"비전|vision|영상 ?처리|시각",["camera_eo","gimbal","companion","npu","dl_perception","tracker","vio"],"센서(EO/IR+짐벌) → 연산(컴패니언+가속기) → 인식/추적/VIO → 제어 입력"),
 ("nongps","non-GPS 항법 기본구조",r"non.?gps|비.?gps|gnss.?denied|gps.?(없|불가|거부)|재밍",["imu","baro","optflow_rf","camera_eo","lidar","vio","lidar_slam","uwb","ekf","companion"],"IMU 적분 + 외부 상대관측(VIO/LiDAR SLAM/광류/UWB)을 EKF로 융합. 절대 보정이 없으면 드리프트 누적"),
 ("motor","모터 기본구조",r"모터|bldc|motor",["motor","esc","propeller","battery"],"BLDC(고정자·회전자·베어링) ← ESC(3상 인버터, 전류·열 한계) ← 배터리. 부하=프롭"),
 ("propeller","프로펠러 기본구조",r"프롭|프로펠러|propeller",["propeller","motor"],"직경·피치·블레이드 수; 디스크 하중이 효율을 좌우, 팁속도 한계"),
 ("imu","IMU 기본구조",r"\bimu\b|관성|자이로|가속도계",["imu","damper","ekf","fc"],"MEMS 자이로+가속도 → 진동 절연 → EKF. 온도·진동·바이어스 드리프트"),
 ("eoir","EO/IR 카메라 기본구조",r"eo/?ir|열화상|적외선|광학 ?카메라|짐벌",["camera_eo","camera_ir","gimbal","companion","vid_pipeline","radio_video"],"광학계+센서 → 짐벌 안정화 → 인코딩/인식 → 영상 링크. GSD = 고도×픽셀피치/초점거리"),
 ("lidar_radar","LiDAR·레이더 기본구조",r"라이다|lidar|레이더|radar",["lidar","radar","tof_us","lidar_slam","mapper"],"LiDAR=고정밀 3D(기상 취약), mmWave 레이더=전천후(해상도 낮음) → 점유지도/SLAM"),
 ("ai","AI 기본구조",r"\bai\b|인공지능|딥러닝|추론|llm|slm",["companion","npu","dl_perception","tracker","task_alloc","mission_mgr"],"센서→전처리→추론(엣지)→의사결정(임무)→제어. 지연·전력·열이 제약"),
 ("battery","배터리 기본구조",r"배터리|battery|lipo|리튬",["battery","bms","pdb_bec","thermal_mgmt"],"셀(S·P 구성) + BMS + 커넥터/배선. 저온·고방전에서 전압 강하, 에너지밀도↔출력밀도 트레이드오프"),
 ("multiagent","멀티에이전트 기본구조",r"멀티.?에이전트|multi.?agent|다중 ?에이전트",["swarm_ctrl","task_alloc","radio_mesh","time_sync","ros2","sec"],"분산 합의/경매 + 통신 계층 + 시간동기 + 보안"),
 ("swarm_ops","군집드론 운용 기본구조",r"군집|swarm",["swarm_ctrl","task_alloc","radio_mesh","uwb","time_sync","ros2","failsafe","gcs","sec"],"상대위치(UWB/시각) + 메시 통신 + 분산 제어 + 두절 폴백 + 지상 감독"),
 ("recon_ops","정찰드론 운용 기본구조",r"정찰|감시|reconnaissance|isr",["camera_eo","camera_ir","gimbal","dl_perception","tracker","radio_video","vid_pipeline","mission_mgr","gcs"],"장시간 체공+안정화 센서+실시간 인식+영상 링크. 은밀성(소음·RF 방사)도 설계 변수"),
 ("rescue_ops","재난구조 드론 운용 기본구조",r"재난|구조|수색|rescue|sar",["camera_ir","dl_perception","radio_mesh","modem_lte","radar","tof_us","winch","release","failsafe"],"인프라 두절 가정(메시/위성) + 열화상 탐색 + 연기·분진에서 레이더 + 인양/투하"),
 ("drop_ops","투하물 드론 운용 기본구조",r"투하|살포|낙하|drop",["release","fc","gnss","ekf","mission_mgr","parachute","winch"],"투하점 계산(풍·고도·낙하시간) + 정밀 위치 + 무게중심 변화 보상 + 안전(사람 상공 금지)"),
 ("comms","드론 통신방식 기본구조",r"통신 ?방식|데이터 ?링크|링크|datalink|c2 ?link",["radio_c2","radio_telem","radio_video","radio_mesh","modem_lte","satcom","antenna","sec"],"C2(저지연·소용량) / 텔레메트리 / 영상(고대역) 3종 트래픽을 서로 다른 링크로 분리하는 것이 기본"),
 ("hetero","이기종 드론 연동 기본구조",r"이기종|heterogene|상호운용|interop|프로토콜",["radio_mesh","ros2","xrce","sec","time_sync"],"공통 분모(ROS2/DDS, MQTT, CoT) 중계 + 어댑터 + 시간/좌표계 통일"),
]

# 임무 프로파일
M = [
 ("recon","정찰",r"정찰|감시|isr|reconnaissance",["target_perception","visual_sensing|thermal_sensing","sensor_stabilization","video_link","state_estimation","navigation_planning","mission_management","ground_control","safety_failsafe"]),
 ("swarm","군집",r"군집|swarm",["swarm_coordination","mesh_networking","relative_localization","time_sync","task_allocation","safety_failsafe","ground_control","link_security"]),
 ("rescue","재난구조",r"재난|구조|수색|rescue|sar",["thermal_sensing","target_perception","mesh_networking|global_link","near_obstacle","payload_release|payload_lowering","state_estimation","safety_failsafe","ground_control"]),
 ("drop","투하",r"투하|살포|낙하|drop",["payload_release","state_estimation","position_gnss","navigation_planning","mission_management","safety_recovery","safety_failsafe"]),
 ("nongps","비GNSS 운용",r"non.?gps|비.?gps|gnss.?denied|gps.?(없|불가|거부)|재밍",["position_nongnss","state_estimation","compute_edge","attitude_estimation"]),
]

J = {
 "_comment": "드론+α 기본구조 온톨로지(저자 정의 설계 지식, 검토 필요). 수치는 일반 범위이며 제품·법규별로 다름. 2026-10-17",
 "disciplines": D, "capabilities": CAP,
 "components": [dict(id=a,name=b,layer=c,disc=d,provides=e,requires=f,note=g) for a,b,c,d,e,f,g in C],
 "links": [dict(id=a,name=b,freqMHz=c,bwMbps=d,rangeKm=e,latencyMs=f,infraFree=g,multiNode=h,note=i) for a,b,c,d,e,f,g,h,i in LINKS],
 "protocols": PROTO,
 "adapters": [dict(a=a,b=b,via=c,maturity=d) for a,b,c,d in ADAPT],
 "couplings": [dict(from_=a,to=b,disc=c,why=d) for a,b,c,d in CPL],
 "factors": FACTORS,
 "topics": [dict(id=a,name=b,alias=c,components=d,summary=e) for a,b,c,d,e in T],
 "missions": [dict(id=a,name=b,alias=c,requires=d) for a,b,c,d in M],
}
# from_ → from
for c in J["couplings"]: c["from"] = c.pop("from_")
# 무결성 검사
ids = {c["id"] for c in J["components"]}
caps = set(CAP)
for c in J["components"]:
    for r in c["requires"]:
        for x in r.split("|"): assert x in caps, (c["id"], x)
    for p in c["provides"]: assert p in caps, (c["id"], p)
for t in J["topics"]:
    for x in t["components"]: assert x in ids, (t["id"], x)
for m in J["missions"]:
    for r in m["requires"]:
        for x in r.split("|"): assert x in caps, (m["id"], x)
json.dump(J, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(C), "components", len(CPL), "couplings", len(T), "topics", len(LINKS), "links")
