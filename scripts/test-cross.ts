// 교차 공학 규칙 검증기 시험 + 저장된 실제 출력의 위반 비율(기준선) 측정. 실행: npx tsx scripts/test-cross.ts [출력 폴더] [접두사]
import fs from "node:fs"
import { crossChecks } from "../lib/cross-rules"
let pass = 0, fail = 0
const t = (name: string, fn: () => void) => { try { fn(); pass++; console.log("PASS ", name) } catch (e) { fail++; console.log("FAIL ", name, "—", e instanceof Error ? e.message : e) } }
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m) }
const HW = "| 모터 | T-Motor MN701-S | ESC | 6S | Jetson Orin Nano 컴패니언 | GNSS RTK 모듈 | 영상 5.8GHz 링크 |"
t("X1: 모터가 있는데 방진·필터 언급이 없으면 위반, 있으면 통과", () => {
  ok(crossChecks("architecture", "FC와 센서를 연결한다.", HW).issues.some((i) => i.includes("X1")), "미탐지")
  ok(!crossChecks("architecture", "IMU는 소프트 마운트로 방진한다.", HW).issues.some((i) => i.includes("X1")), "오탐")
})
t("X2: 컴패니언 컴퓨터는 발열과 페일세이프 둘 다 필요", () => {
  ok(crossChecks("sw", "추론 노드를 둔다.", HW).issues.some((i) => i.includes("X2")), "미탐지")
  ok(crossChecks("sw", "발열 시 전력 모드를 낮추고 컴퓨터가 멈춰도 FC가 페일세이프로 제어한다.", HW).issues.every((i) => !i.includes("X2")), "오탐")
})
t("X3: GNSS+무선 링크면 안테나 이격·차폐 필요", () => {
  ok(crossChecks("techspec", "RTK 사용", HW).issues.some((i) => i.includes("X3")), "미탐지")
  ok(!crossChecks("techspec", "GNSS 안테나는 마스트로 이격한다.", HW).issues.some((i) => i.includes("X3")), "오탐")
})
t("트리거가 없으면 검사하지 않는다(GNSS·컴패니언 없는 HW)", () => {
  const r = crossChecks("architecture", "모듈 설명", "| 모터 | 프레임 |")
  ok(!r.issues.some((i) => i.includes("X2") || i.includes("X3")), "트리거 없는데 위반")
})
t("대상 단계가 아니면 검사하지 않는다(implementation)", () => ok(crossChecks("implementation", "x", HW).checks.length === 0, "구현 단계 검사됨"))
const dir = process.argv[2], pre = process.argv[3]
if (dir && pre) {
  for (const st of ["sw", "techspec", "architecture"]) {
    const f = `${dir}/${pre}_${st}.txt`, hwf = `${dir}/${pre}_hw.txt`
    if (!fs.existsSync(f) || !fs.existsSync(hwf)) continue
    const r = crossChecks(st, fs.readFileSync(f, "utf-8"), fs.readFileSync(hwf, "utf-8"))
    console.log(`  [${pre}] ${st}: 검사 ${r.checks.length}, 위반 ${r.issues.length} ${r.issues.map((i) => i.split("(")[0].slice(-3)).join(",")}`)
  }
}
console.log(`\nPASS ${pass} · FAIL ${fail}`)
process.exit(fail ? 1 : 0)
