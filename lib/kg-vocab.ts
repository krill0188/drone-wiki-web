// 질의 해석 공용 어휘(클래스·규칙 동의어, 한국어→영어 용어). lib/kg.ts(JSON 경로)와 lib/kg-plan.ts(SQLite 경로)가 함께 쓴다.
export const CLASS_ALIAS: Record<string, RegExp> = {
  Motor: /모터|motor/i, ESC: /\besc\b|변속기|전자변속/i, Propeller: /프롭|프로펠러|propeller/i, Battery: /배터리|전지|battery|lipo|리튬/i,
  Frame: /프레임|기체 골격|frame|airframe/i, FlightController: /비행\s*(제어기|컨트롤러)|\bfc\b|flight controller|픽스호크|pixhawk/i,
  CompanionComputer: /컴패니언|온보드\s*컴퓨터|임베디드|jetson|젯슨|라즈베리|raspberry|companion/i, Datalink: /데이터\s*링크|통신|텔레메트리|datalink|radio|lte|5g/i,
  // 공식 클래스 계층(class-hierarchy.json)에 있는 소프트웨어·기체 클래스: 질의 시점에만 인식해 구조(PX4 ⊑ FlightStack ⊑ SoftwareSystem)를 context에 싣는다(문서의 클래스는 바꾸지 않는다)
  PX4: /px4/i, ArduPilot: /ardupilot|아르두파일럿/i, FlightStack: /비행\s*스택|flight\s*stack|펌웨어|firmware/i, Telemetry: /텔레메트리|telemetry/i,
  ROS2: /\bros\s*2\b|ros2|mavros/i, Multirotor: /멀티로터|multirotor|쿼드콥터|quadcopter/i, VTOL: /\bvtol\b|수직\s*이착륙/i, FixedWing: /고정익|fixed.?wing/i,
  GNSS: /gnss|\bgps\b|\brtk\b/i, IMU: /\bimu\b|관성/i, Gimbal: /짐벌|gimbal/i, SwarmCoordinator: /군집|swarm/i,
  CommunicationProtocol: /프로토콜|protocol|mavlink|메시지\s*규격/i, Manufacturer: /제조사|제조업체|manufacturer|\bmaker\b/i,
  // 연구·기법 문서용 주제 클래스(ResearchTopic 하위, 2026-10-24 승인). 개체가 아니므로 문서에 승인된 연결이 있을 때만 근거로 쓰인다. RegulationOps는 법령 verbatim 경로와 겹쳐 별칭을 두지 않는다.
  GNSSInterferenceSecurity: /재밍|스푸핑|기만|교란|jamming|spoofing|jammer/i, PrecisePositioning: /\bppk\b|\bppp\b|정밀\s*측위|네트워크\s*rtk|기준국|기선/i,
  GNSSDeniedNavigation: /gnss.?(거부|denied)|gps.?(거부|denied|미수신)|센서\s*융합|sensor\s*fusion|무결성|raim|\bslam\b/i, GNSSSignalsEnvironment: /신호\s*(규격|계획)|signal\s*plan|멀티패스|multipath|안테나\s*(설치|위치|배치|장착)/i,
  TimingLatency: /레이턴시|latency|시간\s*동기|타임스탬프|timestamp|지연\s*(시간|측정)/i, EdgeAIPerformance: /tensorrt|양자화|quantiz|벤치마크|benchmark|yolo|엣지\s*ai|\bfps\b/i,
  FlightLogData: /비행\s*로그|flight\s*log|ulog|rosbag|데이터셋|dataset/i, SwarmResearch: /다중\s*에이전트|multi.?agent|군집\s*연구/i, QuadrotorControl: /쿼드로터|quadrotor/i,
  Engine: /엔진|내연|가솔린|연료전지|하이브리드\s*발전|\bengine\b|fuel cell/i, Sensor: /센서|라이다|lidar|카메라|camera|gnss|imu/i, Payload: /페이로드|탑재물|짐벌|payload/i,
}

export const RULE_ALIAS: Record<string, RegExp> = {
  R01: /호버|hover|정지\s*비행|소모\s*전력|figure of merit|효율/i, R03: /추력|thrust|추력\s*대\s*중량/i, R04: /디스크\s*로딩|disk loading/i,
  R05: /에너지\s*밀도|wh\/kg|비행\s*시간|체공|endurance|배터리\s*용량/i, R06: /구조\s*(질량|비)|기체\s*무게|empty mass/i, R07: /최고\s*속도|최대\s*속도|max speed/i,
  R08: /고정익|양항비|l\/d|vtol/i, C04: /순항|전진\s*비행|forward flight|cruise/i, C02: /esc.*(전류|정격)|전류\s*정격/i, C03: /고도|공기\s*밀도|altitude/i,
}

export const KO_EN: Record<string, string[]> = {
  패키징: ["packaging", "pkg"], 계수: ["coefficient", "multiplier", "factor"], 배터리: ["battery", "lipo", "pack"], 추력: ["thrust"],
  질량: ["mass", "weight"], 무게: ["weight", "mass"], 전력: ["power"], 소비: ["consumption", "consumed"], 비행: ["flight", "flying"], 호버: ["hover", "hovering"],
  프롭: ["propeller", "prop"], 프로펠러: ["propeller"], 모터: ["motor"], 에너지: ["energy"], 밀도: ["density"], 속도: ["speed", "velocity"], 지연: ["latency", "delay"],
  컴퓨터: ["computer", "compute"], 카메라: ["camera"], 라이다: ["lidar"], 구조: ["structural", "structure", "frame"], 프레임: ["frame", "chassis"], 순항: ["cruise"],
  전진: ["forward"], 항력: ["drag"], 양력: ["lift"], 용량: ["capacity"], 전압: ["voltage"], 전류: ["current"], 온도: ["temperature"], 고도: ["altitude"], 바람: ["wind"], 신고: ["registration"], 증명: ["certificate", "certification"], 과태료: ["fines", "penalties"], 벌칙: ["penalty", "penalties"], 등록: ["registration"], 공역: ["airspace"], 규제: ["regulation", "regulations"],
  제어: ["control", "controller"], 모드: ["mode"], 오프보드: ["offboard"], 알고리즘: ["algorithm"], 센서: ["sensor"], 프로토콜: ["protocol"], 거리: ["distance", "range"], 시간: ["time", "duration"],
  크기: ["size"], 비용: ["cost"], 성능: ["performance"], 효율: ["efficiency"], 안정성: ["stability", "robust"],
  컨트롤러: ["controller"], 허가: ["permit", "permission", "authorization", "approval"], 승인: ["approval", "authorization"], 규정: ["regulation", "regulations", "rule"], 한국: ["korea", "korean"], 법규: ["regulation", "law"],
  통신: ["communication", "datalink", "link"], 시뮬레이션: ["simulation", "simulated"], 추론: ["inference"], 재밍: ["jamming", "jammer", "interference"], 스푸핑: ["spoofing", "spoofer"], 교란: ["jamming", "interference", "disruption"], 탐지: ["detection", "detect", "detecting"], 항법: ["navigation"], 위성: ["satellite", "gnss"], 안테나: ["antenna"], 간섭: ["interference"], 정밀: ["precise", "precision"], 처리: ["throughput", "processing"], 정확도: ["accuracy"],
}
