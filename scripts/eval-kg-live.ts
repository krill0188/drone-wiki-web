// 실제 NVIDIA NIM으로 ontology 우선 답변의 계약 준수율·지연·재작성률을 측정한다(순차 실행). 실행: npx tsx scripts/eval-kg-live.ts
import fs from "node:fs"
import path from "node:path"
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const m = /^NVIDIA_NIM_API_KEY=(.*)$/.exec(line)
  if (m) process.env.NVIDIA_NIM_API_KEY = m[1].replace(/^["']|["']$/g, "")
}
const ANSWERABLE = [
  "T-MOTOR MN5008 모터에 맞는 ESC 알려줘", "Holybro X650 프레임 정보", "Jetson Orin NX 추론 속도", "AeroEval 논문의 배터리 패키징 계수를 알려줘", "배터리 에너지 밀도 근거",
  "호버 전력이 무게에 따라 어떻게 변해?", "고정익 양항비 근거", "Hobbywing 제품 뭐 있어?", "Amprius 배터리 에너지밀도", "전진 비행 시 전력 소비는 호버보다 낮아?",
  "고정익 VTOL 엔진 제조사", "ESC 연속전류와 모터 최대전류 관계", "Desert Aircraft DA-35 엔진 사양", "SunnySky 모터 제품",
]
const INSUFFICIENT = ["드론 군집 비행의 역사 알려줘", "김치찌개 레시피", "양자 컴퓨터로 비행제어를 하는 방법", "PX4 오프보드 제어 모드", "한화에어로스페이스 채용 일정", "드론 보험료 비교"]
async function main() {
  const { answerQuestion } = await import("../lib/kg-answer")
  const rows: { q: string; kind: string; status: string; ms: number; nim: boolean; json: boolean | undefined; retried: boolean; viol: string[]; conf: string; claims: number }[] = []
  for (const [kind, list] of [["answerable", ANSWERABLE], ["insufficient", INSUFFICIENT]] as const) {
    for (const q of list) {
      const t0 = Date.now()
      try {
        const a = await answerQuestion(q)
        rows.push({ q, kind, status: a.status, ms: Date.now() - t0, nim: a.nim_called, json: a.verification.json_parsed, retried: a.verification.retried, viol: a.verification.violations.map((v) => v.code), conf: a.confidence, claims: a.claims.length })
      } catch (e) {
        rows.push({ q, kind, status: "ERROR:" + (e instanceof Error ? e.message.slice(0, 40) : "?"), ms: Date.now() - t0, nim: true, json: false, retried: false, viol: [], conf: "-", claims: 0 })
      }
      const r = rows[rows.length - 1]
      console.log(`${r.kind.padEnd(12)} ${r.status.padEnd(21)} ${String(r.ms).padStart(6)}ms nim=${r.nim ? "Y" : "N"} json=${r.json === undefined ? "-" : r.json ? "Y" : "N"} retry=${r.retried ? "Y" : "N"} conf=${r.conf.padEnd(6)} ${r.viol.length ? "위반:" + r.viol.join("|") : ""} | ${q}`)
    }
  }
  const nimRows = rows.filter((r) => r.nim)
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const ms = nimRows.map((r) => r.ms).sort((a, b) => a - b)
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))]
  const ans = rows.filter((r) => r.kind === "answerable"), ins = rows.filter((r) => r.kind === "insufficient")
  console.log("\n요약")
  console.log(`  NIM 호출 ${nimRows.length}건 · 지연 p50 ${q(0.5)}ms · p95 ${q(0.95)}ms · 최대 ${ms[ms.length - 1]}ms`)
  console.log(`  JSON 계약 준수(첫 시도 파싱 성공): ${nimRows.filter((r) => r.json).length}/${nimRows.length} (${pct(nimRows.filter((r) => r.json).length, nimRows.length)}%)`)
  console.log(`  답변 가능 질문 answered: ${ans.filter((r) => r.status === "answered").length}/${ans.length} · unverified ${ans.filter((r) => r.status === "unverified").length} · insufficient ${ans.filter((r) => r.status === "insufficient_evidence").length} · 오류 ${ans.filter((r) => r.status.startsWith("ERROR")).length}`)
  console.log(`  재작성 발생: ${nimRows.filter((r) => r.retried).length}/${nimRows.length}`)
  console.log(`  근거 없는 질문 insufficient 정확도: ${ins.filter((r) => r.status === "insufficient_evidence" && !r.nim).length}/${ins.length} (NIM 미호출 확인)`)
  const vc: Record<string, number> = {}
  for (const r of rows) for (const v of r.viol) vc[v] = (vc[v] ?? 0) + 1
  console.log(`  위반 유형: ${JSON.stringify(vc)}`)
}
main()
