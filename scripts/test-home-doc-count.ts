// 메인 페이지의 공개 위키 문서 수가 고정 파일이 아니라 실제 페이지 목록에서 나오는지 확인한다(2026-11-07 회귀 방지).
import { readFileSync } from "node:fs"
import { getAllPages } from "../lib/wiki"

const src = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
let failed = 0
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "OK  " : "FAIL"} ${msg}`); if (!ok) failed++ }

check(!/import[^\n]*quality\.json/.test(src), "메인 페이지가 quality.json(고정 파일)을 import 하지 않는다")
check(/getAllPages\(\)\)\.length/.test(src), "문서 수를 getAllPages() 길이에서 계산한다")
async function main() {
  const pages = await getAllPages()
  check(pages.length > 3000, `getAllPages() 가 실제 문서 목록을 돌려준다 (${pages.length}건)`)
  process.exit(failed ? 1 : 0)
}
main()
