import { assess } from "../lib/design-gate"
// R04 디스크 로딩 상수 민감도: 격자 시나리오의 판정(가능/한계/불가) 분포. 상수를 바꿔 여러 번 실행해 비교한다.
const out: string[] = []
for (const N of [4, 6, 8]) for (const size of [250, 450, 650, 900, 1200, 1600]) for (const pay of [0, 0.5, 2, 5, 10, 20]) for (const t of [15, 30]) {
  const f = assess({ payloadKg: pay, rangeKm: 3, sizeMm: size, flightMin: t, rotors: N, platform: "multirotor", platformExplicit: true })
  out.push(f.verdict)
}
const c = out.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {})
console.log(JSON.stringify(c), "n=" + out.length)
console.log(out.join(""))
