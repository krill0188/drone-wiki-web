// 한국어 질문 '핵심어 누락' 거절 게이트 시험(2026-10-27). 운영 실측: 질문 36개 중 18개가 위키에 자료가 있는데도 거절되었고,
// 원인은 활용형('의미야'·'쓰이나요'·'좋을까요'·'과열되는데')이 주제어로 오인되어 위키 문서빈도 검사에서 '희귀어'가 된 것이었다.
// 실행: npx tsx scripts/test-ko-gate.ts   (NIM 호출 없음)
// 최상위 import/export가 없으면 전역 스크립트가 되어 다른 시험 스크립트의 t·ok와 이름이 충돌한다(tsc 실패) — 모듈로 만든다.
export {}
type Result = { name: string; status: "PASS" | "FAIL"; note?: string }
const results: Result[] = []
const t = (name: string, fn: () => string | void) => { try { results.push({ name, status: "PASS", note: fn() || undefined }) } catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) } }
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }

async function main() {
  const { contentTokens, planQuery } = await import("../lib/kg-plan")
  const toks = (q: string) => contentTokens(q).map((x) => x.orig)

  t("K1 활용형 어미 제거: 서술 어미가 주제어로 남지 않는다", () => {
    const cases: [string, string[]][] = [
      ["브러시리스 모터 KV 값은 무슨 의미야?", ["의미야"]], ["SLAM이 드론 자율비행에서 어떻게 쓰이나요?", ["쓰이나요", "쓰이"]],
      ["농업용 방제 드론에 어떤 모터와 프로펠러가 좋을까요?", ["좋을까요", "좋"]], ["군집 드론 통신은 어떤 방식을 쓰는 게 좋아?", ["좋아", "좋"]],
      ["GPS 신호가 불안정할 때 어떻게 해야 해?", ["불안정할"]], ["모터가 과열되는데 어떻게 해결해?", ["과열되는데"]],
    ]
    for (const [q, gone] of cases) { const r = toks(q); for (const g of gone) ok(!r.includes(g), `[${q}] '${g}'가 남음: ${r}`) }
  })

  t("K2 어간은 보존: 실제 주제어(과열·농업·수색·SLAM)는 남는다", () => {
    ok(toks("모터가 과열되는데 어떻게 해결해?").includes("과열"), "과열 소실")
    ok(toks("농업용 방제 드론").includes("농업"), "농업용→농업 실패")
    ok(toks("야간 수색용 드론에 필요한 센서는?").includes("수색"), "수색용→수색 실패")
    ok(toks("SLAM이 드론 자율비행에서 어떻게 쓰이나요?").includes("slam"), "slam 소실")
  })

  t("K3 1글자 서술어 어간은 길이 필터로 사라지고, 일반 명사는 건드리지 않는다", () => {
    ok(!toks("어떤 방식이 좋아?").some((x) => x === "좋" || x === "좋아"), "좋 잔존")
    for (const w of ["분야", "시야", "이해", "정확"]) ok(toks(`${w} 알려줘`).includes(w) || w.length < 2, `일반 명사 훼손: ${w} → ${toks(`${w} 알려줘`)}`)
  })

  const SHOULD_ANSWER = ["PID 튜닝이 뭐고 드론에서 왜 중요해?", "SLAM이 드론 자율비행에서 어떻게 쓰이나요?", "브러시리스 모터 KV 값은 무슨 의미야?", "농업용 방제 드론에 어떤 모터와 프로펠러가 좋을까요?",
    "군집 드론 통신은 어떤 방식을 쓰는 게 좋아?", "GPS 신호가 불안정할 때 어떻게 해야 해?", "모터가 과열되는데 어떻게 해결해?", "PX4에서 EKF 에러가 뜨는 이유는?",
    "야간 수색용 드론에 필요한 센서는?", "사업용 드론 조종자 자격증이 필요해?", "군사용 드론 수출 규제가 있어?"]
  t("K4 운영 실측 거짓 거절 11건이 모두 계획기를 통과(ready)한다", () => {
    const bad = SHOULD_ANSWER.filter((q) => planQuery(q).status !== "ready")
    ok(bad.length === 0, `여전히 거절: ${bad.join(" / ")}`)
    return `${SHOULD_ANSWER.length}/${SHOULD_ANSWER.length}`
  })

  const MUST_REFUSE = ["김치찌개 레시피", "양자 컴퓨터로 비행제어를 하는 방법", "한화에어로스페이스 채용 일정", "드론 보험료 비교", "드론 군집 비행의 역사 알려줘", "오늘 서울 날씨 어때", "파이썬 리스트 정렬 방법 알려줘", "비트코인 시세가 어떻게 돼", "양자 센서로 드론 항법을 하면 어때?"]
  t("K5 대조군: 위키 밖 주제는 계속 거절된다(과잉 허용 방지)", () => {
    const leaked = MUST_REFUSE.filter((q) => planQuery(q).status === "ready")
    ok(leaked.length === 0, `거절되어야 하는데 통과: ${leaked.join(" / ")}`)
    return `${MUST_REFUSE.length}건 모두 거절 유지`
  })

  t("K6 거절 사유 문구에 어미·요청어가 '주제'로 노출되지 않는다", () => {
    for (const q of [...MUST_REFUSE, "추중비 2:1이면 충분한가요?", "Here3 GPS 정확도는?"]) {
      const msg = planQuery(q).limitations.join(" ")
      for (const bad of ["의미야", "쓰이나요", "좋을까요", "과열되는데", "불안정할"]) ok(!msg.includes(`'${bad}'`), `[${q}] 사유에 활용형 노출: ${msg}`)
    }
  })

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
