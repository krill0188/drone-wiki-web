export {} // 모듈로 취급
// 법령 조문 파이프라인 평가(실모델 호출 — 키 필요). 실행: set -a; . <.env.local>; set +a; KG_BACKEND=sqlite npx tsx scripts/eval-law-select.ts [--runs N] [--out FILE]
// 측정 대상은 라우트가 실제로 쓰는 lawTextAnswerSelected(직접 지정 → 범위 밖 개체 가드 → 게이트 → 선택기; 선택기 실패·없음은 조문 없음)의 최종 결과다.
// 골든셋: data/ontology/law-golden.json (reviewed=false 면 잠정 기준), LAW_GOLD=<경로> 로 다른 세트. 정답이 빈 배열인 문항은 "조문이 붙지 않아야" 한다.
import fs from "node:fs"
import path from "node:path"

async function main() {
  const A = process.argv.slice(2), opt = (k: string, d: string) => (A.includes(k) ? A[A.indexOf(k) + 1] : d)
  const runs = Number(opt("--runs", "1")), out = opt("--out", "")
  const { matchLawArticles } = await import("../lib/law-text")
  const { lawTextAnswerSelected, selectorGate, unsupportedZoneCodes } = await import("../lib/law-select")
  const goldPath = process.env.LAW_GOLD ?? path.join(__dirname, "..", "data", "ontology", "law-golden.json")
  const gold = JSON.parse(fs.readFileSync(goldPath, "utf-8"))
  const items: { q: string; answers: string[]; note: string }[] = gold.items
  console.log(`골든셋 ${items.length}문항(법령 ${items.filter((i) => i.answers.length).length} · 범위 밖/비법령 ${items.filter((i) => !i.answers.length).length}) · reviewed=${gold.reviewed} · 반복 ${runs}`)
  type Row = { q: string; note: string; answers: string[]; rules: string[]; sel: string[]; via: string; ms: number }
  const rows: Row[] = []
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < items.length; i += 3) {
      await Promise.all(items.slice(i, i + 3).map(async (it) => {
        const t0 = Date.now(), f = await lawTextAnswerSelected(it.q)
        const via = f ? f.via : unsupportedZoneCodes(it.q).length ? "guard" : selectorGate(it.q) ? "none" : "gate-skip"
        rows.push({ q: it.q, note: it.note, answers: it.answers, rules: (matchLawArticles(it.q)?.articles ?? []).map((a) => a.id), sel: f?.ids ?? [], via, ms: Date.now() - t0 })
      }))
    }
  }
  const law = rows.filter((x) => x.answers.length), non = rows.filter((x) => !x.answers.length)
  const hit = (ids: string[], ans: string[]) => ids.some((i) => ans.includes(i))
  const pct = (n: number, d: number) => `${n}/${d} (${d ? Math.round((n / d) * 100) : 0}%)`
  for (const x of rows.slice(0, items.length).sort((a, b) => a.q.localeCompare(b.q))) {
    const ok = x.answers.length ? hit(x.sel, x.answers) : !x.sel.length
    console.log(`${ok ? "OK " : "XX "}${x.q.slice(0, 30).padEnd(32)} [${x.via}] ${x.sel.map((i) => i.replace("LAW-", "")).join(", ") || "-"}${ok ? "" : x.answers.length ? `  ← 정답 ${x.answers.map((i) => i.replace("LAW-", "")).join("|")}` : "  (조문이 붙으면 안 됨)"}`)
  }
  const selHit = law.filter((x) => hit(x.sel, x.answers)).length, ruleHit = law.filter((x) => hit(x.rules, x.answers)).length
  const prec = law.filter((x) => x.sel.length).map((x) => x.sel.filter((i) => x.answers.includes(i)).length / x.sel.length)
  const lat = rows.map((x) => x.ms).sort((a, b) => a - b)
  const via = (v: string) => rows.filter((x) => x.via === v).length
  console.log("\n── 요약(최종 파이프라인) ──")
  console.log(`정답 포함 ${pct(selHit, law.length)} · (참고) 규칙 매칭만 ${pct(ruleHit, law.length)}`)
  console.log(`정밀도(선택한 조문 중 정답 비율) ${prec.length ? Math.round((prec.reduce((a, b) => a + b, 0) / prec.length) * 100) : 0}% · 조문 평균 ${(law.reduce((n, x) => n + x.sel.length, 0) / (law.length || 1)).toFixed(1)}건`)
  console.log(`범위 밖/비법령 오탐(조문이 붙음) ${pct(non.filter((x) => x.sel.length).length, non.length)}  [규칙 매칭만 ${pct(non.filter((x) => x.rules.length).length, non.length)}]`)
  console.log(`경로: direct ${via("direct")} · selector ${via("selector")} · none ${via("none")} · guard ${via("guard")} · gate-skip ${via("gate-skip")} · 지연 p50 ${lat[Math.floor(lat.length / 2)]}ms p90 ${lat[Math.floor(lat.length * 0.9)]}ms max ${lat[lat.length - 1]}ms`)
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), runs, reviewed: gold.reviewed, rows }, null, 1))
}
main()
