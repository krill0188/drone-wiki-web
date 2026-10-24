// 단계 간 일치성 점검 시험(운영 HW 출력 고정본 + 합성 불일치).
import fs from "fs"
import { findStageConflicts, stageConsistencyNote } from "../lib/stage-consistency"
const hw = fs.readFileSync(new URL("./fixtures-hw-sample.md", import.meta.url), "utf8")
let fail = 0
const must = (n: string, ok: boolean) => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n) }
const clean = "SW는 Cube Orange+ 위에서 PX4로 동작하며 12S 16Ah 배터리를 쓴다. 프롭 40인치, 모터 KV 135. 텔레메트리 링크는 900 MHz대 Mini Mesh Rider를 쓴다. AUW 19.2 kg."
const r0 = findStageConflicts(hw, clean)
must("일치하는 텍스트는 불일치 0건", r0.conflicts.length === 0)
must("비교 항목이 여러 개 실행된다", r0.compared.length >= 4)
const bad = "FC는 ARK Electronics ARKV6X를 쓴다. 배터리는 4S 2.5Ah, 프롭 8인치, 모터 KV 435. AUW 6 kg. 영상 링크는 5.8 GHz LoRa 대신 915 MHz가 아닌 2.4 GHz 통신을 쓴다."
const r1 = findStageConflicts(hw, bad)
const topics = r1.conflicts.map((c) => c.topic)
must("다른 FC 제품 감지", topics.includes("비행제어기"))
must("배터리 S·Ah 불일치 감지", topics.includes("배터리 S·Ah"))
must("프롭 지름 불일치 감지", topics.includes("프롭 지름"))
must("모터 KV 불일치 감지", topics.includes("모터 KV"))
must("총중량 불일치 감지", topics.includes("총중량(AUW)"))
const hwLink = ["| 구성요소 | 온톨로지 클래스 | 선정안 | 핵심 사양 |", "|---|---|---|---|", "| 통신 | Datalink | ○ Doodle Labs Mini Mesh Rider | - 900MHz ISM 텔레메트리 |"].join("\n")
must("링크 대역 불일치 감지(HW 900 MHz ↔ 5.8 GHz)", findStageConflicts(hwLink, "영상 링크는 5.8 GHz 대역을 쓴다").conflicts.some((c) => c.topic === "링크 대역"))
must("링크 대역 일치는 통과(HW 900 MHz ↔ 900 MHz)", !findStageConflicts(hwLink, "텔레메트리 링크는 900 MHz대를 쓴다").conflicts.some((c) => c.topic === "링크 대역"))
must("직렬 팩 표기(6S 16Ah ×2→12S)는 불일치로 보지 않음", findStageConflicts(hw, "배터리는 6S 16Ah 두 개를 직렬로 쓴다").conflicts.every((c) => c.topic !== "배터리 S·Ah"))
must("빈 입력은 빈 문자열", stageConsistencyNote("", "x", "SW") === "" && stageConsistencyNote(hw, "", "SW") === "")
must("일치 시 안내 문구", stageConsistencyNote(hw, clean, "SW 단계").includes("모순되는 부품·수치를 보이지 않습니다"))
must("❌ 문자 미사용", !stageConsistencyNote(hw, bad, "SW 단계").includes("❌"))
console.log(fail ? `FAIL ${fail}건` : "PASS 전부 통과"); process.exit(fail ? 1 : 0)
