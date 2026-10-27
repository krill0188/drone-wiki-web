// 라벨된 일반 공학 설명 계층 시험(설계서 docs/ai-qa-improvement-plan.md §3.6의 오프라인 부분: E1 차단 목록, E2 대조군, 검증기, 흐름).
// 실행: npx tsx scripts/test-general-tier.ts   (NIM 호출 없음 — 모델은 대역으로 주입)
export {}
type Result = { name: string; status: "PASS" | "FAIL"; note?: string }
const results: Result[] = []
const t = async (name: string, fn: () => Promise<string | void> | string | void) => { try { results.push({ name, status: "PASS", note: (await fn()) || undefined }) } catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) } }
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }

const BLOCKED = [
  // 안전·비행 가능 판단
  "바람이 10m/s일 때 쿼드콥터는 안전하게 비행할 수 있어?", "비 오는 날 드론 날려도 돼?", "야간에 비행해도 괜찮아?", "강풍에서 드론 위험해?", "배터리가 부풀었는데 계속 써도 안전해?", "기체가 흔들리는데 비행 가능해?",
  // 안전 치명 상황
  "리포 배터리가 부풀어 오르는 이유는?", "배터리에서 연기가 나는 원인은?", "드론이 추락한 이유가 뭐야?", "비행 중 불이 붙는 원인은?", "충돌 사고가 나는 원인은?",
  // 법규·제도
  "드론 비행 승인은 어떻게 받아?", "250g 이하 드론도 등록해야 해?", "사업용 드론 조종자 자격증이 필요해?", "군사용 드론 수출 규제가 있어?", "드론 보험은 어떤 걸 들어야 해?", "야간 비행은 허용돼?", "드론 과태료는 뭐야?",
  // 제품·추천
  "T-Motor MN5008 스펙 알려줘", "Pixhawk 6X와 6C 차이는?", "DJI Mavic 3 비행시간은?", "6S 배터리에 맞는 ESC 추천해줘", "가장 좋은 FPV 제품 추천해줘", "Here3 GPS 정확도는?", "브러시리스 모터 가격 비교해줘",
  // 수치·계산·what-if
  "배터리 용량을 5000mAh에서 10000mAh로 늘리면 비행시간이 두 배가 돼?", "프로펠러를 10인치에서 12인치로 바꾸면 효율이 어떻게 달라져?", "페이로드 3kg 올리면 비행시간이 얼마나 줄어?", "기체 무게 2kg 쿼드콥터 호버링에 필요한 전력은 얼마야?",
  "추중비 2:1이면 충분한가요?", "비행시간은 몇 분 나와?", "몇 S 배터리를 써야 해?", "KV 값 계산 공식 알려줘", "추력을 늘리면 어떻게 돼?", "배터리를 바꾸면 얼마나 좋아져?",
]
const CONTROLS = ["김치찌개 레시피", "양자 컴퓨터로 비행제어를 하는 방법", "한화에어로스페이스 채용 일정", "드론 보험료 비교", "드론 군집 비행의 역사 알려줘", "오늘 서울 날씨 어때", "파이썬 리스트 정렬 방법 알려줘", "비트코인 시세가 어떻게 돼", "양자 센서로 드론 항법을 하면 어때?", "파이썬 정렬은 어떻게 해?", "양자 컴퓨터가 뭐야?",
  // 원인형 문장이지만 드론이 아닌 질문 — 강한 드론 어휘가 없어 자격이 없어야 한다
  "스마트폰 배터리가 빨리 닳는 이유는?", "컴퓨터가 자꾸 꺼지는 이유는?", "김치찌개가 짜진 이유는?", "주식이 떨어지는 원인은?", "자동차 엔진에서 소리가 나는 이유는?", "에어컨 모터가 떨리는 원인은?", "세탁기 센서 에러가 뜨는 이유는?"]
// 절차형(캘리브레이션·설정 방법)은 제외 대상이다(실작업 절차를 일반 지식으로 답하면 틀리거나 안전 사항이 빠진다).
// 정의형도 제외 대상이다(2026-10-27 E4: 정의형 출력에서 사실 오류 다수 — 프로펠러 피치·오프보드 제어 등). 정의는 위키 기초 개념 문서 보강으로 해결한다.
const DEFINITIONAL = ["브러시리스 모터 KV 값은 무슨 의미야?", "PID 튜닝이 뭐고 드론에서 왜 중요해?", "비행 컨트롤러의 역할이 뭐야?", "ESC가 하는 일이 뭐야?", "프로펠러 피치가 뭐야?", "추력과 양력의 차이는?"]
const PROCEDURAL = ["ESC 캘리브레이션은 어떻게 해?", "컴퍼스 캘리브레이션 방법 알려줘", "펌웨어 업데이트는 어떻게 해?"]
const SHOULD = ["모터가 과열되는데 어떻게 해결해?", "드론이 이륙 후 한쪽으로 계속 쏠려요. 원인이 뭘까요?", "비행 중 영상 전송이 끊겨요", "PX4에서 EKF 에러가 뜨는 이유는?", "GPS 신호가 불안정할 때 어떻게 해야 해?", "짐벌이 떨리는 원인이 뭐야?"]
const GOOD = "**원인 후보**\n- 연결 부위가 느슨해져 신호가 불안정해지는 경우가 있을 수 있습니다.\n- 주변의 전자기 간섭이 신호에 영향을 주는 경우가 있을 수 있습니다.\n- 부품이 오래 쓰여 성능이 저하된 경우가 있을 수 있습니다."

async function main() {
  const { planQuery } = await import("../lib/kg-plan")
  const G = await import("../lib/general-tier")

  await t("G1 차단 목록(E1): 안전·법규·제품·수치 질문 30개에서 자격 없음", () => {
    ok(BLOCKED.length >= 30, `시험 질문 ${BLOCKED.length}개(<30)`)
    const leaked = BLOCKED.filter((q) => G.eligibility(q, planQuery(q)).eligible)
    ok(leaked.length === 0, `차단되어야 하는데 자격 있음: ${leaked.join(" / ")}`)
    return `${BLOCKED.length}개 전부 차단`
  })

  await t("G2 대조군(E2): 위키 밖 질문은 자격 없음(도메인 확인에서 걸러짐)", () => {
    const leaked = CONTROLS.filter((q) => G.eligibility(q, planQuery(q)).eligible)
    ok(leaked.length === 0, `대조군인데 자격 있음: ${leaked.join(" / ")}`)
    return `${CONTROLS.length}개 전부 자격 없음`
  })

  await t("G3 정상 질문 자격: 정의·원인·점검형 8개가 자격을 얻는다", () => {
    const miss = SHOULD.filter((q) => !G.eligibility(q, planQuery(q)).eligible)
    ok(miss.length === 0, `자격이 없어야 하지 않은 질문: ${miss.map((q) => `${q}→${G.eligibility(q, planQuery(q)).reason}`).join(" / ")}`)
  })

  await t("G3b 절차형 질문은 자격 없음(실작업 절차 제외)", () => {
    const leaked = PROCEDURAL.filter((q) => G.eligibility(q, planQuery(q)).eligible)
    ok(leaked.length === 0, `절차형인데 자격 있음: ${leaked.join(" / ")}`)
  })

  await t("G3c 정의형 질문은 자격 없음(E4에서 사실 오류 다수)", () => {
    const leaked = DEFINITIONAL.filter((q) => G.eligibility(q, planQuery(q)).eligible)
    ok(leaked.length === 0, `정의형인데 자격 있음: ${leaked.join(" / ")}`)
  })

  await t("G4 제품 개체가 연결된 질문은 유형이 맞아도 차단", () => {
    const q = "T-MOTOR MN5008 모터가 과열되는데 어떻게 해결해?"
    const el = G.eligibility(q, planQuery(q)); ok(!el.eligible, `자격 있음: ${el.reason}`)
  })

  await t("G5 위키 주제어 누락 거절은 일반 설명으로 채우지 않는다", () => {
    const q = "양자 컴퓨터로 비행제어를 하는 방법"
    const p = planQuery(q); ok(p.status !== "ready", "전제: 계획기 거절"); ok(/주제를 직접 다루는 문서를 갖고 있지 않아/.test(p.limitations.join(" ")), `전제: 주제어 누락 사유가 아님: ${p.limitations}`)
    ok(!G.eligibility(q, p).eligible, "주제어 누락 거절인데 자격 있음")
  })

  await t("V1 검증기: 정상 문단 통과", () => { const v = G.validateGeneral(GOOD); ok(v.ok, v.reason) })
  const bad: [string, string][] = [
    ["숫자", GOOD + "\n- 보통 10% 정도입니다."], ["목록 번호", "1. 첫째\n2. 둘째\n" + GOOD], ["수치 단어", GOOD + "\n- 수십 배 차이가 날 수 있습니다."], ["퍼센트 단어", GOOD + "\n- 삼십 퍼센트가 일반적입니다."],
    ["단정", GOOD + "\n- 반드시 이렇게 해야 합니다."], ["안전 단정", GOOD + "\n- 이 경우 안전합니다."], ["제조사", GOOD + "\n- DJI 제품은 보통 그렇습니다."], ["소프트웨어", GOOD + "\n- ArduPilot에서는 이렇게 합니다."],
    ["너무 짧음", "- 짧다"], ["항목 없음", "이것은 항목 없이 길게 이어지는 설명입니다. ".repeat(6)], ["항목 과다", Array.from({ length: 12 }, (_, i) => `- 항목 ${"가나다라마바사아자차카타파하"[i]}`).join("\n") + "\n" + GOOD],
  ]
  for (const [name, text] of bad) await t(`V2 검증기 거부: ${name}`, () => { const v = G.validateGeneral(text); ok(!v.ok, "통과되면 안 됨") })

  const scope: [string, string][] = [["점검 순서 소제목", GOOD + "\n\n**점검 순서**\n- 육안으로 확인합니다."], ["정의 소제목", "**정의·원리**\n- 설명입니다.\n" + GOOD], ["영어 단어 혼용", GOOD + "\n- 펌웨어 mismatch가 있는 경우가 있을 수 있습니다."], ["항목 하나뿐", "**원인 후보**\n- 하나의 원인이 있을 수 있는 경우가 많이 있습니다 그리고 그 설명이 이어집니다."]]
  for (const [name, text] of scope) await t(`V2d 검증기 범위 밖 거부: ${name}`, () => { const v = G.validateGeneral(text); ok(!v.ok, "통과되면 안 됨") })

  const garbled: [string, string][] = [["한글+영어 철자 혼합", GOOD + "\n- 프롭eller가 불균형하면 흔들릴 수 있습니다."], ["악센트 문자", GOOD + "\n- 바ométric 센서가 영향을 받을 수 있습니다."], ["한자", GOOD + "\n- 電源 문제일 수 있습니다."]]
  for (const [name, text] of garbled) await t(`V2b 검증기 거부(깨진 출력): ${name}`, () => { const v = G.validateGeneral(text); ok(!v.ok, "통과되면 안 됨") })

  await t("V2c 정상 약어는 통과: ESC·GPS·IMU 뒤에 한글 조사", () => { ok(G.validateGeneral(GOOD + "\n- ESC가 신호를 받고 GPS와 IMU의 정보가 함께 쓰입니다.").ok, "약어+조사가 거부됨") })

  await t("F6 목록 번호는 수치가 아니다: 번호 목록은 불릿으로 정규화되어 통과, 본문 숫자는 여전히 폐기", async () => {
    const numbered = "**원인 후보**\n1. 연결이 느슨한 경우가 있을 수 있습니다.\n2. 부품이 열화된 경우가 있을 수 있습니다.\n3. 설정이 맞지 않는 경우가 있을 수 있습니다."
    const r1 = await G.generalTier("모터가 과열되는 원인이 뭐야?", { generate: async () => numbered }); ok(r1.status === "shown" && !/\d\./.test(r1.text!), `${r1.status}/${r1.reason}`)
    const r2 = await G.generalTier("모터가 과열되는 원인이 뭐야?", { generate: async () => numbered + "\n- 보통 30도 이상이면 문제입니다." }); ok(r2.status === "rejected", `${r2.status}/${r2.reason}`)
  })

  await t("V3 검증기 제조사 이름: KG 제조사명도 걸러진다", () => {
    const v = G.validateGeneral(GOOD + "\n- Hobbywing 변속기는 흔히 쓰입니다."); ok(!v.ok && /제조사/.test(v.reason), v.reason)
  })

  await t("C1 본문 공백 판정: 한계 문구·본문 문구를 인식하고, 충실한 본문은 공백이 아니다", () => {
    ok(G.hasCoverageGap(["질문의 '의미'에 해당하는 내용은 선택된 근거에서 찾지 못했습니다. 그 부분은 답하지 않습니다."], ""), "한계 문구")
    ok(G.hasCoverageGap([], "KV 값의 정확한 정의는 제공된 근거에서 확인할 수 없습니다."), "본문 문구")
    ok(!G.hasCoverageGap(["수치는 위키 요약이므로 신뢰도를 높게 두지 않았습니다."], "PID는 비례·적분·미분 제어입니다. [P1]"), "충실한 본문을 공백으로 판정")
  })

  await t("F1 흐름: 자격 있음 → 라벨·면책이 붙은 블록, 본문 텍스트는 포함하지 않음", async () => {
    const r = await G.generalTier("모터가 과열되는데 어떻게 해결해?", { generate: async () => GOOD })
    ok(r.status === "shown" && r.text, `${r.status}/${r.reason}`)
    ok(r.text!.startsWith(G.GENERAL_HEADER) && r.text!.includes("근거 아님") && r.text!.includes(G.GENERAL_FOOTER), "라벨·면책 누락")
    ok(!/\[(P|C|R)\d+\]/.test(r.text!), "인용 표기가 붙음")
  })

  await t("F2 흐름: 검증 실패 시 블록 없음(rejected, 사유 기록)", async () => {
    const r = await G.generalTier("모터가 과열되는데 어떻게 해결해?", { generate: async () => GOOD + "\n- 보통 1000 정도입니다." })
    ok(r.status === "rejected" && !r.text && /숫자/.test(r.reason), `${r.status}/${r.reason}`)
  })

  await t("F3 흐름: 차단 질문은 모델을 아예 호출하지 않는다", async () => {
    let calls = 0
    for (const q of [BLOCKED[0], BLOCKED[7], BLOCKED[20], CONTROLS[0]]) { const r = await G.generalTier(q, { generate: async () => { calls++; return GOOD } }); ok(r.status === "skipped", `${q}: ${r.status}`) }
    ok(calls === 0, `차단·대조군에서 모델 호출 ${calls}회`)
  })

  await t("F4 흐름: 모델 호출 실패는 skipped(예외가 새지 않음)", async () => {
    const r = await G.generalTier("모터가 과열되는데 어떻게 해결해?", { generate: async () => { throw new Error("boom") } })
    ok(r.status === "skipped", r.status)
  })

  await t("F5 플래그: 기본 off, KG_GENERAL=1일 때만 on", () => {
    delete process.env.KG_GENERAL; ok(!G.generalTierEnabled(), "기본이 on")
    process.env.KG_GENERAL = "1"; ok(G.generalTierEnabled(), "on 미작동"); delete process.env.KG_GENERAL
  })

  await t("R1 라우트: 동의 없으면 403, 플래그 off면 skipped(disabled), 잘못된 입력 400, 차단 질문은 모델 없이 skipped", async () => {
    const { NextRequest } = await import("next/server")
    const { POST } = await import("../app/api/general-tier/route")
    const mk = (body: unknown, cookie?: string) => new NextRequest("http://localhost/api/general-tier", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
    const CONSENT = "dw_consent=2026-10-25; dw_sid=test-route"
    delete process.env.KG_GENERAL
    const r0 = await POST(mk({ question: "모터가 과열되는 원인은?" })); ok(r0.status === 403, `동의 없음 ${r0.status}`)
    const r1 = await POST(mk({ question: "모터가 과열되는 원인은?" }, CONSENT)); const j1 = await r1.json(); ok(j1.status === "skipped" && j1.reason === "disabled", JSON.stringify(j1))
    process.env.KG_GENERAL = "1"
    try {
      const r2 = await POST(mk({ question: "" }, CONSENT)); ok(r2.status === 400, `빈 질문 ${r2.status}`)
      const r3 = await POST(mk({ question: "x".repeat(400) }, CONSENT)); ok(r3.status === 400, `긴 질문 ${r3.status}`)
      const r4 = await POST(mk({ question: "바람이 10m/s일 때 안전하게 비행할 수 있어?" }, CONSENT)); const j4 = await r4.json(); ok(j4.status === "skipped" && /차단/.test(j4.reason) && !j4.text, JSON.stringify(j4))
      const r5 = await POST(mk({ question: "김치찌개가 짜진 이유는?" }, CONSENT)); const j5 = await r5.json(); ok(j5.status === "skipped" && !j5.text, JSON.stringify(j5))
    } finally { delete process.env.KG_GENERAL }
  })

  await t("U1 UI 블록: 서버 렌더에서 로딩 문구를 그리고, 점선 라벨 구조를 가진다", async () => {
    const React = (await import("react")).default
    const { renderToStaticMarkup } = await import("react-dom/server")
    const Block = (await import("../components/GeneralTierBlock")).default
    const html = renderToStaticMarkup(React.createElement(Block, { question: "시험 질문" }))
    ok(html.includes("준비하는 중") && html.includes('role="status"'), html)
  })

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
