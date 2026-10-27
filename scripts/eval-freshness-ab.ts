// 신선도 규칙이 실제 NIM 답변 계약(JSON 준수·검증 통과)에 미치는 영향을 on/off 번갈아 반복 측정한다. 순차 실행. 실행: npx tsx scripts/eval-freshness-ab.ts [반복수=3]
import fs from "node:fs"
import path from "node:path"
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const m = /^NVIDIA_NIM_API_KEY=(.*)$/.exec(line)
  if (m) process.env.NVIDIA_NIM_API_KEY = m[1].replace(/^["']|["']$/g, "")
}
const Q = ["T-MOTOR MN5008 모터에 맞는 ESC 알려줘", "Holybro X650 프레임 정보", "Jetson Orin NX 추론 속도", "Hobbywing 제품 뭐 있어?", "Amprius 배터리 에너지밀도", "Desert Aircraft DA-35 엔진 사양", "SunnySky 모터 제품"]
const N = Number(process.argv[2] ?? 3)
type Row = { flag: "on" | "off"; q: string; status: string; json: boolean | undefined; retried: boolean; viol: string[] }
async function main() {
  const { answerQuestion } = await import("../lib/kg-answer")
  const rows: Row[] = []
  for (let i = 0; i < N; i++) for (const q of Q) for (const flag of (i % 2 ? ["off", "on"] : ["on", "off"]) as ("on" | "off")[]) {
    if (flag === "on") process.env.KG_FRESHNESS = "1"; else delete process.env.KG_FRESHNESS
    try {
      const a = await answerQuestion(q)
      rows.push({ flag, q, status: a.status, json: a.verification.json_parsed, retried: a.verification.retried, viol: a.verification.violations.map((v) => v.code) })
    } catch (e) { rows.push({ flag, q, status: "ERROR", json: false, retried: false, viol: [String(e).slice(0, 40)] }) }
    const r = rows[rows.length - 1]
    console.log(`R${i + 1} ${flag.padEnd(3)} ${r.status.padEnd(11)} json=${r.json ? "Y" : "N"} retry=${r.retried ? "Y" : "N"} ${r.viol.join("|")} | ${q}`)
  }
  delete process.env.KG_FRESHNESS
  console.log("\n요약(제품 질문, 번갈아 반복)")
  for (const flag of ["off", "on"] as const) {
    const x = rows.filter((r) => r.flag === flag), n = x.length
    console.log(`  ${flag.padEnd(3)}: n=${n} · JSON 첫 시도 ${x.filter((r) => r.json).length}/${n} · answered ${x.filter((r) => r.status === "answered").length}/${n} · 재작성 ${x.filter((r) => r.retried).length}/${n} · 위반 ${x.reduce((s, r) => s + r.viol.length, 0)}건 ${JSON.stringify(x.flatMap((r) => r.viol).reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {}))}`)
  }
}
main()
