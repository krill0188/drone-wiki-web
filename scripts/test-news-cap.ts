export {} // 모듈로 취급
// 뉴스 섹션 문서당 상한(capNewsSection) 시험 — 오프라인 순수 함수. 실행: npx tsx scripts/test-news-cap.ts
type R = { name: string; ok: boolean; note?: string }
const results: R[] = []
const t = (name: string, fn: () => void) => { try { fn(); results.push({ name, ok: true }) } catch (e) { results.push({ name, ok: false, note: e instanceof Error ? e.message : String(e) }) } }
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m) }

async function main() {
  const { capNewsSection, NEWS_MAX_PER_DOC } = await import("../lib/self-update")
  const H = "## 📰 최근 관련 소식"
  const bullets = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `- 기사 ${from + i} (출처, 2026-11-0${(i % 9) + 1}) — https://e.com/${from + i}`)
  const doc = (n: number, tail = "") => `---\ntitle: T\n---\n\n# T\n\n본문 한 줄\n\n${H}\n${bullets(n).join("\n")}\n${tail}`

  t("T1 상한 이하는 원문 그대로(멱등·no-op)", () => { const d = doc(NEWS_MAX_PER_DOC); ok(capNewsSection(d) === d, "변경됨") ; ok(capNewsSection(doc(3), 5) === doc(3), "3건 변경됨") })
  t("T2 상한 초과 시 가장 오래된(앞쪽) 불릿부터 덜어내고 최신 N건을 순서대로 보존", () => {
    const removed: string[] = []
    const out = capNewsSection(doc(10), 4, (r) => removed.push(...r))
    ok(removed.length === 6 && removed[0].includes("기사 1 ") && removed[5].includes("기사 6 "), `덜어낸 불릿 ${removed.length}`)
    const kept = out.split("\n").filter((l) => l.startsWith("- "))
    ok(kept.length === 4 && kept[0].includes("기사 7 ") && kept[3].includes("기사 10 "), `남은 ${kept.join("|")}`)
  })
  t("T3 두 번 적용해도 같다(멱등)", () => { const once = capNewsSection(doc(12), 5); ok(capNewsSection(once, 5) === once, "두 번째 적용에서 변경") })
  t("T4 섹션 밖(본문·프런트매터·다른 섹션)은 바이트 그대로, 섹션 뒤 다른 섹션의 불릿은 건드리지 않음", () => {
    const tail = `\n## 관련 개념\n- [[a]]\n- [[b]]\n- [[c]]\n- [[d]]\n- [[e]]\n- [[f]]\n`
    const out = capNewsSection(doc(8, tail), 3)
    ok(out.startsWith("---\ntitle: T\n---\n\n# T\n\n본문 한 줄\n\n" + H), "머리 변형")
    ok(out.endsWith(tail), "다음 섹션 변형")
    ok(out.split("\n").filter((l) => l.startsWith("- 기사")).length === 3, "뉴스 3건 아님")
  })
  t("T5 불릿이 아닌 줄(설명·빈 줄)은 남고 섹션이 없으면 그대로", () => {
    const d = `# T\n\n${H}\n(자동 수집)\n${bullets(6).join("\n")}\n`
    const out = capNewsSection(d, 2); ok(out.includes("(자동 수집)") && out.split("\n").filter((l) => l.startsWith("- ")).length === 2, "설명 줄 손실")
    ok(capNewsSection("# T\n\n본문\n", 1) === "# T\n\n본문\n", "섹션 없는 문서 변경")
  })
  t("T6 실제 규모: 592건 문서는 상한 건수만 남고 크기가 한 자릿수 KB 로 준다", () => {
    const big = doc(592); const small = capNewsSection(big, NEWS_MAX_PER_DOC)
    ok(small.split("\n").filter((l) => l.startsWith("- ")).length === NEWS_MAX_PER_DOC && Buffer.byteLength(small) < Buffer.byteLength(big) / 10, `크기 ${Buffer.byteLength(small)}`)
  })
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  — ${r.note}` : ""}`)
  const f = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - f}/${results.length} PASS${f ? `, ${f} FAIL` : ""}`)
  process.exit(f ? 1 : 0)
}
main()
