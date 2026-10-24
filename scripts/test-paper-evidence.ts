// 논문 근거 적용 계층 시험: 단계별 선택·규모 표기·출처 표 생성이 결정론으로 동작하는지.
import fs from "fs"
import { selectPaperClaims, paperEvidenceBlock, paperEvidenceNote } from "../lib/paper-evidence"
import { parseSpec } from "../lib/design-gate"
const hw = fs.readFileSync(new URL("./fixtures-hw-sample.md", import.meta.url), "utf8")
const spec = parseSpec("농업용 방제 드론을 만들고 싶습니다. 페이로드 10kg, 비행거리 5km, 기체 크기 1.5m급 멀티로터, 비행시간 20분 이상.")
let fail = 0
const must = (n: string, ok: boolean) => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n) }
const hwp = selectPaperClaims("hw", spec, hw)
must("HW 단계에서 논문 claim을 고른다(1~6건)", hwp.length >= 1 && hwp.length <= 6)
must("한 논문이 2건을 넘게 독점하지 않는다", Object.values(hwp.reduce<Record<string, number>>((a, p) => ((a[p.c.sourceId] = (a[p.c.sourceId] ?? 0) + 1), a), {})).every((n) => n <= 2))
must("모든 claim에 근거 종류·규모 표기가 있다", hwp.every((p) => p.label && p.scale))
must("주입 블록에 claim id가 들어간다", paperEvidenceBlock(hwp).includes(`[${hwp[0].c.id}]`))
const note = paperEvidenceNote(hwp, `본문 인용 [${hwp[0].c.id}]`)
must("출처 표에 '본문 인용'과 '본문 미인용'이 구분된다", note.includes("본문 인용") && note.includes("본문 미인용") === (hwp.length > 1))
must("proposal 단계에는 선택하지 않는다", selectPaperClaims("proposal", spec, hw).length === 0)
must("관련 claim이 없으면 없다고 공개한다", paperEvidenceNote([], "").includes("직접 맞는 논문 claim을 지식그래프에서 찾지 못했습니다"))
must("❌ 문자 미사용", !note.includes("❌"))
console.log(fail ? `FAIL ${fail}건` : "PASS 전부 통과"); process.exit(fail ? 1 : 0)
