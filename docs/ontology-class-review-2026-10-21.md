# 온톨로지 클래스 연결 제안 검토 결과 (2026-10-21)

대상: `docs/ontology-class-proposals.md`를 현재 DB(645문서, `ontology_class` 명시 65)로 다시 뽑은 결과 — 제안 241건(A 78 · B 56 · C 107).
원칙: 문서의 `ontology_class`는 "이 문서의 **주제 자체**가 그 클래스의 개체·종류인가"일 때만 붙인다. 키워드가 제목·슬러그에 있다는 것만으로는 붙이지 않는다.

## 결론: 이번에 승인한 연결 0건

1차 일괄 승인(A 130건 중 52건)으로 쉬운 것은 이미 반영됐고, 남은 A 78건은 대부분 키워드 일치일 뿐 주제가 아니다.
**~/2nd 문서는 하나도 바꾸지 않았다.**

| 남은 A 묶음 | 판정 | 이유 |
|---|---|---|
| Datalink 14건 (MAVLink·pymavlink·5G 공격) | 보류 | MAVLink는 통신 **프로토콜**이지 데이터링크 장치가 아니다. `CommunicationProtocol` 클래스 신설이 선행. 5G 공격 논문은 주제가 보안 |
| Frame 6건 | 거부 | `framework`의 `-frame` 일치. 한국 법체계 개요·LLM 프레임워크 등은 기체 프레임이 아니다 (레지스트리 1건만 해당하나 아래 Manufacturer 문제) |
| IMU 5건 | 거부 | `simulation`의 `imu` 부분 문자열 일치 |
| GNSS 5건 | 거부 | GPS 미사용·기만 연구 논문 — 주제는 항법/보안이며 GNSS 수신기 개체가 아님 |
| Multirotor 10건 | 거부 | 쿼드로터 **제어·RL 논문**. 기체 개체가 아니라 알고리즘 문서 |
| SwarmCoordinator 14건 | 거부/보류 | 군집 연구 논문·동향. 코디네이터 소프트웨어 개체는 `software-registry-swarm-multiagent` 정도만 후보 |
| LiDAR 5건 | 거부 | 임야·DEM 분석 논문. 센서 개체 아님 |
| Motor·Payload·Propeller·Battery·FlightController·ESC·FlightStack 중 `vendor-registry-*`, `software-registry-*` | 보류 | 제조사/SW **레지스트리** 문서는 부품 개체가 아니라 목록. `Manufacturer`·`SoftwareRegistry` 클래스 제안과 함께 결정 |
| 기타 오탐 | 거부 | DJI 펌웨어(`firmware`→FlightStack), HoverAir(짐벌 드론), BRINC(Motorola의 `motor`), E-Rocket(PX4는 보조 도구), 대안 동력(`lte`) |

## 다음에 풀어야 할 것 (설계 결정)
1. 새 클래스 제안 3종 — `CommunicationProtocol`(MAVLink 등), `Manufacturer`/`Registry`, `Engine`. 승인하면 위 보류 건 약 25건이 올바른 클래스로 연결된다.
2. 제안 규칙(`scripts/build-knowledge-db.py` 키워드 매칭)을 부분 문자열이 아니라 단어 경계로 바꾸고 `framework`·`simulation`·`motorola` 오탐을 제거하면 A 등급 정확도가 올라간다.
3. B·C는 변경 없음(B는 문서별 사람 검토, C는 태그 일치뿐이라 보류).
