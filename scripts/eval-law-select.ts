export {} // 모듈로 취급
// 법령 조문 선택기 평가(실모델 호출 — 키 필요). 실행: set -a; . <.env.local>; set +a; KG_BACKEND=sqlite npx tsx scripts/eval-law-select.ts [--runs N] [--out FILE]
// 골든셋: data/ontology/law-golden.json (reviewed=false 면 잠정 기준). 측정: 정답 포함률(recall@5), 정밀도, 비법령 오탐, 지연, 규칙 매칭과의 비교, 게이트가 막은 법령 질문.
import fs from "node:fs"
import path from "node:path"

async function main() {
  const A = process.argv.slice(2), opt = (k: string, d: string) => (A.includes(k) ? A[A.indexOf(k) + 1] : d)
  const runs = Number(opt("--runs", "1")), out = opt("--out", "")
  const { matchLawArticles } = await import("../lib/law-text")
  const { selectLawArticles, selectorGate } = await import("../lib/law-select")
  const goldPath = process.env.LAW_GOLD ?? path.join(__dirname, "..", "data", "ontology", "law-golden.json") // LAW_GOLD=다른 세트 경로로 독립 검증
  const gold = JSON.parse(fs.readFileSync(goldPath, "utf-8"))
  const items: { q: string; answers: string[]; note: string }[] = gold.items
  console.log(`골든셋 ${items.length}문항(법령 ${items.filter((i) => i.answers.length).length} · 비법령 ${items.filter((i) => !i.answers.length).length}) · reviewed=${gold.reviewed} · 반복 ${runs}`)
  type Row = { q: string; note: string; answers: string[]; rules: string[]; sel: string[]; status: string; ms: number; gate: boolean; raw?: string }
  const rows: Row[] = []
  for (let r = 0; r < runs; r++) {
    const batch = items.slice()
    const res: Row[] = []
    for (let i = 0; i < batch.length; i += 3) {
      await Promise.all(batch.slice(i, i + 3).map(async (it) => {
        const t0 = Date.now(), s = await selectLawArticles(it.q)
        res.push({ q: it.q, note: it.note, answers: it.answers, rules: (matchLawArticles(it.q)?.articles ?? []).map((a) => a.id), sel: s.articles.map((a) => a.id), status: s.status, ms: Date.now() - t0, gate: selectorGate(it.q), raw: s.raw })
      }))
    }
    rows.push(...res)
  }
  const law = rows.filter((x) => x.answers.length), non = rows.filter((x) => !x.answers.length)
  const hit = (ids: string[], ans: string[]) => ids.some((i) => ans.includes(i))
  const pct = (n: number, d: number) => `${n}/${d} (${d ? Math.round((n / d) * 100) : 0}%)`
  for (const x of rows.slice(0, items.length)) {
    const ok = x.answers.length ? hit(x.sel, x.answers) : !x.sel.length
    console.log(`${ok ? "OK " : "XX "}${x.q.slice(0, 30).padEnd(32)} 선택기[${x.status}] ${x.sel.map((i) => i.replace("LAW-", "")).join(", ") || "-"}${x.answers.length ? "" : "  (정답: 없음)"}${ok ? "" : x.answers.length ? `  ← 정답 ${x.answers.map((i) => i.replace("LAW-", "")).join("|")}` : ""}`)
  }
  const selHit = law.filter((x) => hit(x.sel, x.answers)).length, ruleHit = law.filter((x) => hit(x.rules, x.answers)).length
  const prec = law.filter((x) => x.sel.length).map((x) => x.sel.filter((i) => x.answers.includes(i)).length / x.sel.length)
  const lat = rows.map((x) => x.ms).sort((a, b) => a - b)
  console.log("\n── 요약 ──")
  console.log(`선택기 정답 포함 ${pct(selHit, law.length)} · 규칙 매칭 ${pct(ruleHit, law.length)}`)
  console.log(`선택기 정밀도(선택한 조문 중 정답 비율, 평균) ${prec.length ? Math.round((prec.reduce((a, b) => a + b, 0) / prec.length) * 100) : 0}% · 선택 평균 ${(law.reduce((n, x) => n + x.sel.length, 0) / (law.length || 1)).toFixed(1)}건`)
  console.log(`비법령 오탐(조문이 붙음) 선택기 ${pct(non.filter((x) => x.sel.length).length, non.length)} · 규칙 ${pct(non.filter((x) => x.rules.length).length, non.length)}`)
  console.log(`상태: ${["selected", "none", "failed"].map((s) => `${s} ${rows.filter((x) => x.status === s).length}`).join(" · ")} · 지연 p50 ${lat[Math.floor(lat.length / 2)]}ms p90 ${lat[Math.floor(lat.length * 0.9)]}ms max ${lat[lat.length - 1]}ms`)
  const blocked = law.filter((x) => !x.gate && hit(x.sel, x.answers))
  console.log(`게이트(selectorGate)가 막았을 정답 질문: ${blocked.length}건${blocked.length ? " — " + [...new Set(blocked.map((x) => x.q))].slice(0, 6).join(" / ") : ""}`)
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), runs, reviewed: gold.reviewed, rows }, null, 1))
}
main()
