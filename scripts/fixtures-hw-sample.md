## 1. HW 구성요소 표

| 구성요소 | 온톨로지 클래스 | 선정안 | 핵심 사양 | 인터페이스 | 근거 |
|---|---|---|---|---|---|
| 프레임 (Frame) | Frame | △ **카탈로그 후보 없음 — 재확인 필요** (휠베이스 1500mm ±35% 확보용) | - 휠베이스 1500mm ±35% (1950~1650mm)<br>- 자체 중량 ≤ 8650g(추정 AUW 19.2kg의 45%)<br>- 카본 파이프 혹은 X-형 레이아웃 | - 모터 마운트 구멍 패턴<br>- 배터리 트레이<br>- 페이로드 마운트 브라켓 | 제품 카탈로그 직접 검색 시 후보 확인 필요 |
| 모터 4개 | Actuator (Motor) | ○ **T-MOTOR MN701-S IP45 Multirotor (KV135) ×4** | - Max thrust: 9.7 kgf ×4 = 38.8 kgf ≥ 38.4 kgf(필요 추력)<br>- KV: 135<br>- 6S 호환<br>- Max current: 42A<br>- 무게: 415 g ×4 = 1.66 kg | - ESC 4핀 (DShot/OneShot)<br>- 냉각핀<br>- 마운팅 플레인 | https://store.tmotor.com/product/mn701-s-kv135-motor-navigator-type.html |
| ESC 4개 | Actuator (ESC) | △ **카탈로그 후보 없음 — 재확인 필요** (60A 12S BLHeli_32급) | - 정격 전류: ≥ 60A<br>- 12S(50.4V) 최대 입력<br>- 48V~72V 범위 지원<br>- BLHeli_32 펌웨어<br>- 브레이크 기능 | - 모터 3상<br>- FC DroneCAN/SBUS<br>- 전원 입력 (Vbat+/Vbat-) | Drone Power & Battery 위키 문서 참조; 후보 목록에 해당 제품 없음 |
| 프로펠러 4쌍 | Actuator (Propeller) | △ **카탈로그 후보 없음 — 재확인 필요** (40인치 폴딩 CF) | - 지름: ≤ 40인치 (휠베이스 1500mm 기준 상한)<br>- 폴딩 타입<br>- 12인치 pitch 추천<br>- CF(탄소소재) 권장 | - 모터 샤프트 1인치(25.4mm) 홀<br>- CW/CCW 쌍 | 위키 하드웨어 문서 및 파워트레인 모델 논문 검증 필요; 후보 목록에 해당 제품 없음 |
| 배터리 | Battery | △ **카탈로그 후보 없음 — 재확인 필요** (6S 16Ah ×2 직렬, 총 12S 16Ah) | - 총 에너지: ≥ 714 Wh (목표 충족)<br>- 배터리 질량: ≈ 3.5 kg(총 7kg)<br>- 전압: 12S(50.4V 임의)<br>- 용량: 16Ah<br>- UN38.3 인증 필수 | - XT90(또는 EC5) 연결<br>- BMS Balance 포트<br>- FC 전원 입력 (5V Power Module 권장) | Drone Power & Battery 위키 문서; 제품 데이터시트 Wh 값 확인 필요; 후보 목록에 해당 조합 없음 |
| 비행제어기 (FC) | FlightController | ○ **CubePilot Cube Orange+ (또는 Cube BlueH7)** | - PX4/ArduPilot 기본 지원<br>- RTK(GNSS) 내장 또는 Here3/NEO-F9P 연동<br>- CAN 포트 2개<br>- 전원: 4.1~5.5V / 350mA<br>- 무게: 재확인 필요 (참고: Cube Orange 기준 ~315g)<br>- UAVCAN 지원 | - USB-C(펌웨어/설정)<br>- DroneCAN (ESC/GNSS)<br>- SBUS/CRCSerial (리모컨)<br>- TELEM2/4 (통신 링크)<br>- 외부 5V Power Module 입력 포트 | https://docs.cubepilot.org/autopilot/the-cube/introduction/flight-management-unit-fmu |
| 센서군 | Sensor | ○ **Holybro H-RTK NEO-F9P (RM3100 compass) Rover** | - RTK 고정 지원<br>- 위치 정확도 ≤ 0.1 m<br>- 관성 측정 내장<br>- 무게: 39 g (rover) | - DroneCAN (FC 연결)<br>- UART (GNSS 데이터) | https://docs.holybro.com/gps-and-rtk-system/h-rtk-neo-f9p-series-rm3100-compass/specification |
| 통신 HW (영상+텔레메) | Datalink | △ **영상: 카탈로그 후보 없음 — 재확인 필요 (5.8GHz 30Mbps급)**<br>○ **텔레메: Doodle Labs Mini Mesh Rider radio** | - 영상 대역: 5.8GHz ISM (Mbps급 필수)<br>- 텔레메트리 대역: 900MHz ISM / 2.4GHz 멀티밴드<br>- 최대 전력: 1.6 W (32 dBm)<br>- 범위: 50+ km<br>- 지연시간 < 200ms (영상 기준) | - 영상: Micro HDMI/RCA (별도 링크 필요)<br>- 텔레메: UAVCAN/SBUS<br>- 전원: 5V from FC | [2] Drone Power & Battery; [7] 드론 업계 주요 소식(2026-10-03); https://doodlelabs.com/products/radios/mini |
| 페이로드 모듈 | Payload | △ **카탈로그 후보 없음 — 재확인 필요** (10kg 탱크·펌프·노즐) | - 탱크 용량: 10L 이상<br>- 펌프 유량: ≥ 2 L/min<br>- 노즐: 4개 (분사 폭 3m 목표)<br>- 페이로드 중량: 10 kg(탱크·펌프·노즐 포함)<br>- 연료/약제 호환성 | - FC MAVLink 컨트롤 (분사 ON/OFF)<br>- 전원: 5V/12V from FC/Esc<br>- 마운트: 프레임 전면/하부 | ops-mission 위키 문서; 페이로드 시스템 위키 문서 참조 |
| 컴패니언 컴퓨터 | ComputeUnit | △ **미정의 — AI자율성 구현 시 필요** | - VOXL 2 Mini(15 TOPS) 혹은 Skynode S 등<br>- GNSS·VO 연동 가능<br>- 전력: 4~6W (CPU 적재 시)<br>- 무게: 14g~16g | - MAVLink<br>- USB/ETH<br>- 전원: 5V from FC | ai-autonomy 위키 문서 참조; 카탈로그 후보 존재하나 이 용도 적합성 검증 필요 |

---

## 2. 중량·전력 예산 (낙관 가정: 에너지밀도 207Wh/kg, 시스템 효율 85%)

| 항목 | 값 | 계산식 / 비고 |
|---|---|---|
| **추정 총중량(AUW)** | **19.2 kg** | 페이로드 10 kg + 배터리 3.5 kg(총 7 kg) + FC/센서 1.5 kg + 통신 HW 0.5 kg + 프레임/모터/ESC/프롭 등 4.2 kg |
| **호버링 전력** | **≈ 1928 W** | 전체 중량 19.2kg 기반 하버링 소비전력(P ⇢ 약 100×무게(kg)+α 추정; 위키 멀티로터 전력 모델 논문 참조) |
| **20분 비행 에너지 필요량** | **≈ 714 Wh** | P × t = 1928W × (20/60)h ≈ 643 Wh → 배터리 방전 깊이 90% 및 에너지밀도 207Wh/kg 적용 시 최소 714 Wh 필요 |
| **필요 배터리 에너지(Wh)** | **≥ 714 Wh** | 목표 충족을 위해 12S 16Ah × 2 조합(총 714Wh 근사) 권장 |
| **총 최대추력 필요** | **≥ 38.4 kgf** | 추력 대비 중량비 2:1 목표 → AUW 19.2kg × 2 = 38.4 kgf |
| **모터 1개당 추력** | **≥ 9.6 kgf** | 4개 모터 합계 ≥ 38.4 kgf → 1개당 ≥ 9.6 kgf |
| **예상 체공시간** | **≥ 20 min** (만재 탱크 시) | 배터리 714Wh / 호버 1928W × 60 ≈ 22.3 min(이론) → 실제 20분 보장 목표 |

> ⚠️ **낙관 가정(에너지밀도 207Wh/kg, 효율 85%)에서만 성립**. 보수 가정(에너지밀도 180Wh/kg)에서는 714Wh → 629Wh 수준으로 부족 → 20분 비행 시 추가 배터리(질량 증가) 또는 페이로드 감량이 필요함.

---

## 3. HW 의존·호환 관계

1. **배터리 → FC (전원공급):** `powers` — 배터리가 FC의 Power Module에 5V/12V를 공급해야 비행 제어가 가능함. (Drone Power & Battery 위키 참조)
2. **FC → ESC (제어신호):** `controls` — FC가 ESC에 DShot/OneShot 신호를 통해 모터 속도를 명령함. (Flight-Control 위키 문서 기준)
3. **FC → GNSS (위치피드백):** `interfaces_with` — FC가 H-RTK NEO-F9P를 통해 RTK 위치를 수신하고 자율 비행에 활용함. (Holybro H-RTK 문서 참조)
4. **FC → 통신 HW (텔레메트리):** `interfaces_with` — FC가 900MHz/2.4GHz Mesh Rider 링크를 통해 GCS로 텔레메트리 데이터를 전송함. (Doodle Labs Mini Mesh Rider 사양서)
5. **FC → 영상 링크 (실시간 영상):** `interfaces_with` — FC가 5.8GHz 영상 링크(별도 선정 필요)에 Micro HDMI 신호를 전송하여 GCS에 실시간 영상 송출함. (드론 업계 주요 소식 영상 링크 항목)
6. **프레임 → 모터 (구조적 지지):** `mounted_on` — 4개 모터가 프레임의 각 팔에 고정되어 기체 구조를 구성함. (프레임/모터 호환성 검증 필요)
7. **배터리 → 페이로드 (전원 분배):** `powers` — 배터리 잔량 및 유량 모니터링을 위해 페이로드 모듈에 전원(5V/12V)을 공급할 수 있는 Power Distribution Board(PDB) 필요. (하드웨어 통합 관행)
8. **모터 → ESC (전력 전달):** `powers` — ESC가 배터리로부터 전력을 받아 모터에 공급하고, FC는 ESC의 전류/전압 데이터를 모니터링함. (파워트레인 기본 구조)

---

## 4. 온톨로지 보강 필요 (클래스 미정의 / 근거 부족)

| 항목 | 사유 | 비고 |
|---|---|---|
| 프레임 | 휠베이스 1500mm ±35%에 맞는 상용 카본 프레임 카탈로그가 위키에 부재 | "재확인 필요" — 직접 제조사 카탈로그 조회 권장 |
| ESC | 60A 12S BLHeli_32급 ESC 후보가 제품 매치 목록에 없음 | KDE/Hobbywing 등 제조사 직접 확인 필요 |
| 프로펠러 | 40인치 폴딩 CF 프로펠러 후보가 제품 매치 목록에 없음 | HQProps/T-Motor 등 제조사 직접 확인 필요 |
| 배터리 | 6S 16Ah ×2 직렬(12S 16Ah) 조합 후보가 제품 매치 목록에 없음 | UN38.3 인증 제품 직접 소싱 필요 |
| 영상 링크 | 5.8GHz 30Mbps급 영상 전송 링크 후보가 제품 매치 목록에 없음 | ImmersionRC/Connex 등 제조사 직접 확인 필요 |
| 페이로드 모듈 | 10kg 탱크·펌프·노즐 통합 모듈은 위키에 '방제 전용 페이로드' 카테고리 부재 | ops-mission·sensing-perception에 존재하나 실제 탱크 구성 문서 부재 |
| 컴패니언 컴퓨터 | 이 컨셉(방제·20분 비행)에서 AI자율성 구현이 필수인지 불명 → 클래스 미정의 | AI가 필요한 경우 VOXL 2 Mini 등 후보 있으나 '재확인 필요' |

---

## 서버 검증 결과 (코드 판정 · 위반 1회 자동 재작성 후)
- ✅ 서버 후보가 있는 분류를 '후보 없음'으로 쓰지 않음
- ✅ 선정안은 모두 카탈로그 후보이거나 '후보 없음'
- ✅ 카탈로그 값으로 확인되는 부품 질량 합 ≤ 추정 총중량 19.2kg의 115% — 확인된 부품 질량 합 0.04kg (프레임·FC 등 재확인 필요 부품 제외)

모든 자동 검증 항목 통과.