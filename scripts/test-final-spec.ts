// 4단계 확정 스펙 파서·우선순위·출처 표기 시험.
import fs from "fs"
import { parseFinalSpec, finalBasics, finalSpecStructureIssue } from "../lib/final-spec"
import { buildGateNote } from "../lib/gates-adapter"
import { findStageConflicts } from "../lib/stage-consistency"
import { parseSpec } from "../lib/design-gate"
const hw = fs.readFileSync(new URL("./fixtures-hw-sample.md", import.meta.url), "utf8")
const spec = parseSpec("농업용 방제 드론을 만들고 싶습니다. 페이로드 10kg, 비행거리 5km, 기체 크기 1.5m급 멀티로터, 비행시간 20분 이상.")
const tech = `## 1. 성능 요구와 대조\n...\n## 5. 확정 기술 스펙 요약\n1. **기체**: X형 쿼드 · 휠베이스 1500 mm\n2. **모터**: T-MOTOR MN701-S IP45 Multirotor · KV 135 · 4개\n3. **ESC**: 60A급 · 연속 60 A · 4개\n4. **프롭**: 지름 34인치 · 4개\n5. **배터리**: LiPo 팩 · 12S · 20 Ah · 질량 4200 g\n6. **총중량(AUW)**: 19.2 kg\n7. **FC**: CubePilot Cube Orange+\n8. **컴패니언 컴퓨터**: 미정\n9. **통신**: Doodle Labs Mini Mesh Rider · 900MHz\n10. **페이로드**: 10 kg\n`
let fail = 0
const must = (n: string, ok: boolean) => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n) }
const fs1 = parseFinalSpec(tech), fb = finalBasics(fs1)
must("10개 라벨을 읽는다", Object.keys(fs1.fields).length === 10)
must("배터리 12S 20Ah 질량 4200 g", fb.cells === 12 && fb.ah === 20 && fb.batMassG === 4200)
must("프롭 34인치·KV 135·ESC 60 A·AUW 19.2", fb.propIn === 34 && fb.kv === 135 && fb.escA === 60 && fb.auwKg === 19.2)
must("'미정' 값은 값으로 쓰지 않는다", fb.companion === undefined)
must("형식이 맞으면 구조 이슈 없음", finalSpecStructureIssue(tech) === null)
must("형식이 깨지면 구조 이슈", finalSpecStructureIssue("## 5. 확정 기술 스펙 요약\n모터는 좋다") !== null)
const note = buildGateNote({ spec, hwMd: hw, compareText: hw, finalSpecMd: tech })
must("출처 표: 확정 스펙이 HW 표보다 우선(배터리 20Ah)", /배터리 S·Ah \| 12S 20Ah \| doc:4단계 확정 스펙/.test(note))
must("출처 표: 프롭은 확정 스펙 34인치", /프롭 지름 \| 34인치 \| doc:4단계 확정 스펙/.test(note))
must("출처 표: 가정은 assumption: 표기", note.includes("assumption:") && note.includes("doc:사용자 입력"))
const noteHwOnly = buildGateNote({ spec, hwMd: hw, compareText: hw })
must("확정 스펙이 없으면 HW 표 출처", /배터리 S·Ah \| 12S 16Ah \| doc:HW 표/.test(noteHwOnly))
const c1 = findStageConflicts(hw, "프롭 40인치, 배터리 12S 16Ah", tech)
must("확정 스펙 기준 비교(프롭 40인치는 불일치)", c1.baseLabel.includes("4단계 확정 스펙") && c1.conflicts.some((c) => c.topic === "프롭 지름"))
console.log(fail ? `FAIL ${fail}건` : "PASS 전부 통과"); process.exit(fail ? 1 : 0)
