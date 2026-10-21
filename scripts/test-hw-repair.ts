import { repairHwSelections, validateHw } from "../lib/stage-validate"
import type { MatchData } from "../lib/product-match"

// HW 선정안 서버 치환 시험: 카탈로그 밖 ESC는 서버 후보로, 후보 없는 분류는 '후보 없음'으로 바뀌고 정상 행은 그대로여야 한다.
const d: MatchData = { cands: [
  { category: "motor", name: "T-Motor MN6007 160KV", modelKey: "mn6007", massG: 400, maxThrustG: 9000, maxA: 40 },
  { category: "esc", name: "Hobbywing XRotor Pro 60A 12S", modelKey: "xrotor", keys: ["xrotor pro 60a"], massG: null, contA: 60 },
], needWh: null, auwKg: 15, n: 4, maxPropIn: 28, maxThrustG: 9000, hoverG: 3750, payloadG: 10000 }
const md = `| 구성요소 | 선정안 | 핵심 사양 | 인터페이스 | 근거 |\n|---|---|---|---|---|\n| 모터 | T-Motor MN6007 160KV × 4 | 400g | - | 공식 |\n| ESC | **Hobbywing H110A 14S** × 4 | 50A CAN | CAN | 모델 |\n| 프레임 | Tarot X6 | 1.5m | - | 모델 |\n| 배선 | 12AWG | - | - | - |\n`
const r = repairHwSelections(md, d)
let fail = 0
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fail++ }
ok(r.repaired.length === 2, `치환 2건 (실제 ${r.repaired.length}): ${r.repaired.join(" ; ")}`)
ok(r.md.includes("| T-Motor MN6007 160KV × 4 | 400g | - | 공식 |"), "정상 모터 행 불변")
ok(/Hobbywing XRotor Pro 60A 12S/.test(r.md) && r.md.includes("서버 치환"), "ESC가 서버 후보로 치환되고 공개 표기")
ok(/\| 프레임 \| 카탈로그 후보 없음/.test(r.md), "후보 없는 프레임은 '후보 없음'으로 시작")
ok(/XRotor Pro 60A 12S × 4/.test(r.md), "수량 × 4 유지")
ok(r.md.includes("| 배선 | 12AWG | - | - | - |"), "배선 행(검사 제외) 불변")
ok(/연속전류 60A _\(서버 카탈로그 값\)_/.test(r.md) && !/50A CAN/.test(r.md), "치환 행의 사양 칸이 카탈로그 값으로 교체되고 모델 원문 사양은 제거")
const v = validateHw(r.md, d)
ok(v.checks.find((c) => c.label.startsWith("선정안은 모두"))?.ok === true, "치환 후 '카탈로그 밖' 검증 통과")
process.exit(fail ? 1 : 0)
