// SW 실행 위치 ↔ HW 표 이름 매칭 시험: 같은 부품의 다른 표기는 통과, HW 표에 없는 부품·일반어만 겹치는 경우는 ❌.
import { validateSw } from "../lib/stage-validate"
const hw = [
  "| 구성요소 | 클래스 | 선정안 | 사양 |", "|---|---|---|---|",
  "| 비행제어기 | FC | ○ CubePilot Cube Orange+ | x |", "| 컴패니언 | CU | ○ ModalAI VOXL 2 Mini | y |",
].join("\n")
const mk = (loc: string) => ["| 구성요소 | 분류 | 선정안 | 실행 위치 | 사양 | 근거 |", "|---|---|---|---|---|---|", `| 미들웨어 | M | MAVROS | ${loc} | z | w |`].join("\n")
const cases: [string, boolean][] = [["VOXL 2 Mini (Companion)", true], ["Cube Orange+ / PX4", true], ["VOXL 2 Mini → Cube Orange+", true], ["ARKV6X 내부 버스", false], ["Companion", false], ["Jetson Orin", false]]
let fail = 0
for (const [loc, want] of cases) { const got = validateSw(mk(loc), hw).checks[0].ok; if (got !== want) fail++; console.log(got === want ? "PASS" : "FAIL", loc, "→", got ? "통과" : "❌") }
console.log(`PASS ${cases.length - fail} · FAIL ${fail}`); process.exit(fail ? 1 : 0)
