// 자가 갱신 파이프라인 — 최신 드론 뉴스/논문(.ua/news-feed.json)을 기존 위키 문서와
// 교차 참조해 "## 📰 최근 관련 소식" 섹션을 제안·반영한다. lib/self-update.ts 참고.
//
// 기본은 dry-run(제안만 출력, 문서 미변경). --apply를 줘야 실제로 .md 파일에 반영된다.
// ~/2nd/scripts/extract-knowledge-graph.py + .sh 와 같은 패턴(배치 스크립트,
// 사람이 검토 후 --apply, Hermes cron으로 주기 실행 가능)을 그대로 따른다.
//
// 실행: npx tsx scripts/self-update-pipeline.ts [--apply] [--limit=20]

import { getSelfUpdateProposals, applyProposal, isSelfUpdateWritable } from "../lib/self-update"

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const limitArg = args.find((a) => a.startsWith("--limit="))
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 20

  const proposals = getSelfUpdateProposals(limit)
  console.log(`[self-update] 뉴스↔위키 교차 참조 후보 ${proposals.length}건 (미처리 뉴스 최대 ${limit}건 기준)`)
  for (const p of proposals) {
    console.log(`  - "${p.newsTitle}" ↔ [${p.slug}] ${p.docTitle}  (score=${p.score.toFixed(2)})`)
  }

  if (proposals.length === 0) {
    console.log("반영할 신규 후보가 없습니다(모든 뉴스가 이미 처리됐거나 관련 문서를 찾지 못함).")
    return
  }

  if (!apply) {
    console.log("\n(dry-run) 실제로 문서에 반영하려면 --apply 플래그를 추가하세요.")
    return
  }

  if (!isSelfUpdateWritable()) {
    console.error("VERCEL 환경에서는 --apply를 실행할 수 없습니다(로컬 전용).")
    process.exitCode = 1
    return
  }

  let applied = 0
  for (const p of proposals) {
    const res = applyProposal(p)
    if (res.ok) applied++
    else console.error(`  ⚠️ [${p.slug}] 반영 실패: ${res.error}`)
  }
  console.log(`\n✅ ${applied}/${proposals.length}건 문서에 반영 완료`)
}

main().catch((err) => {
  console.error("[self-update] 실행 중 오류:", err)
  process.exitCode = 1
})
