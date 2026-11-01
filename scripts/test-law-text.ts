export {} // 전역 스크립트 취급으로 다른 시험의 t·ok 와 충돌하지 않도록 모듈로 만든다
// 법령 조문 인용(3단계 S3-2) 시험 — 오프라인(모델 호출 없음). 실행: KG_BACKEND=sqlite npx tsx scripts/test-law-text.ts
// 주의: L5 의 질문들은 매칭 규칙을 다듬는 데 쓴 것이라 '회귀 확인'이지 일반화 성능이 아니다. 일반화는 튜닝에 쓰지 않은 질문(설계서 §12)으로 따로 쟀다.
import fs from "node:fs"
import path from "node:path"
import type { LawArticle } from "../lib/law-text"

type Result = { name: string; status: "PASS" | "FAIL"; note?: string }
const results: Result[] = []
const t = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try { const note = await fn(); results.push({ name, status: "PASS", note: note || undefined }) }
  catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) }
}
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }

async function main() {
  const L = await import("../lib/law-text")
  const claims = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "ontology", "law-claims.json"), "utf-8")).claims as LawArticle[]
  const ids = (q: string) => (L.matchLawArticles(q)?.articles ?? []).map((a) => a.id)

  await t("L1 직접 지정: 법령 이름 + 조 번호(가지번호 포함), 시행령·시행규칙을 법과 혼동하지 않음", () => {
    ok(ids("항공안전법 제122조 알려줘").join() === "LAW-aviation-safety-act-122", "제122조")
    ok(ids("항공안전법 제125조의2 내용은?").join() === "LAW-aviation-safety-act-125-2", "가지번호")
    ok(ids("항공안전법 시행령 제25조").join() === "LAW-aviation-safety-act-decree-25", "시행령")
    ok(ids("항공안전법 시행규칙 제308조").join() === "LAW-aviation-safety-act-rule-308", "시행규칙")
    ok(ids("군사기지법 제10조").join() === "LAW-military-base-act-10" && ids("드론법 제25조").join() === "LAW-drone-promotion-act-25", "약칭")
    ok(ids("항공안전법 제122조와 시행규칙 제301조 비교").join() === "LAW-aviation-safety-act-122,LAW-aviation-safety-act-rule-301", "한 질문의 두 법령")
  })

  await t("L2 미수록: 선정에 없는 조문은 추측하지 않고 '수록되어 있지 않습니다' + 법제처 링크", () => {
    const m = L.matchLawArticles("항공안전법 제100조")!
    ok(m.direct && m.articles.length === 0 && m.missing[0]?.article === "제100조", "미수록 판정")
    const text = L.renderLawBlock(m)
    ok(text.includes("수록된 조문이 아닙니다") && text.includes("https://www.law.go.kr/법령/항공안전법/제100조"), "미수록 안내·링크")
    ok(!text.includes("**관련 조문**"), "미수록인데 조문 블록이 나옴")
    ok(L.renderLawBlock(L.matchLawArticles("항공안전법 시행령 제999조")!).includes("법령/항공안전법시행령/제999조"), "공백 없는 시행령 링크")
  })

  await t("L3 주제 매칭: 튜닝에 쓴 질문(회귀) — 정답 조문이 포함된다", () => {
    const G: [string, string][] = [
      ["초경량비행장치 신고는 어디서 해?", "LAW-aviation-safety-act-122"], ["특별비행승인 대상은?", "LAW-aviation-safety-act-rule-312-2"], ["드론 조종자 증명이 필요한가?", "LAW-aviation-safety-act-125"],
      ["비행금지구역에서 비행하면 과태료는?", "LAW-aviation-safety-act-166"], ["군사기지 근처 비행안전구역에서 드론 날려도 돼?", "LAW-military-base-act-10"], ["드론특별자유화구역이 뭐야?", "LAW-drone-promotion-act-10"],
      ["초경량비행장치사용사업 등록 요건", "LAW-aviation-business-act-48"], ["드론 활용 촉진법 벌칙", "LAW-drone-promotion-act-25"], ["야간에 드론 비행하려면 승인 받아야 해?", "LAW-aviation-safety-act-127"], ["허가 없이 비행했을 때 처벌", "LAW-aviation-safety-act-161"],
    ]
    for (const [q, id] of G) ok(ids(q).includes(id), `${q} → ${ids(q).join(",") || "없음"}`)
  })

  await t("L4 통제: 비법령·공학·펌웨어 질문과 법령어가 낀 공학 질문에는 조문이 붙지 않는다", () => {
    for (const q of ["PX4 EKF2 지연 기본값은?", "MAVLink가 뭐야?", "멀티콥터 배터리 용량 계산법", "FC 펌웨어로 PX4와 ArduPilot 중 어느 쪽이 유리해?", "드론 촬영 영상 편집 추천", "승인 알고리즘을 PX4 오프보드에서 구현하는 법", "배터리 등록 번호 규정 UL 인증", "허가된 주파수 대역에서 텔레메트리 링크 예산 계산", "ArduPilot 파라미터 신고 기능", "동원목재 제품 가격", "전기차 충전 요금 알려줘"])
      ok(!L.matchLawArticles(q), `조문이 붙음: ${q} → ${ids(q).join(",")}`)
  })

  await t("L5 블록: 모든 선정 조문의 원문이 글자 그대로(줄마다 '> ' 인용) 들어가고 출처 링크·시행일·고지가 있다", () => {
    for (const a of claims) {
      const text = L.renderLawBlock({ articles: [a], missing: [], direct: true, omitted: 0 }, new Date("2026-11-02T00:00:00Z"))
      for (const line of a.text.split("\n")) ok(text.includes(`> ${line}`), `${a.id} 줄 누락: ${line.slice(0, 30)}`)
      ok(text.includes(`(${a.url})`) && text.includes(`시행 ${a.effective}`) && text.includes(`수집 ${a.fetched_at}`), `${a.id} 링크·날짜`)
    }
    const text = L.renderLawBlock(L.matchLawArticles("항공안전법 제122조")!, new Date("2026-11-02T00:00:00Z"))
    ok(text.includes("법적 자문이 아닙니다") && text.includes("적용되는지, 비행이 가능한지는 판단하지 않습니다"), "고지 문구")
    ok(!/가능합니다|불가능합니다|위반입니다|해당됩니다/.test(text.replace(/^>.*$/gm, "")), "서버 문구에 법적 결론 표현")
    ok(!text.includes("자동으로 골랐습니다"), "직접 지정인데 자동 선별 경고가 붙음")
    const auto = L.renderLawBlock(L.matchLawArticles("초경량비행장치 신고는 어디서 해?")!, new Date("2026-11-02T00:00:00Z"))
    ok(auto.includes("관련 있어 보이는 조문을 자동으로 골랐습니다") && auto.includes("맞지 않는 조문이 섞이거나"), "자동 선별 경고 없음")
  })

  await t("L6 시점: 수집 7일 경과 경고, 시행 예정 표시, 부분 시행·조문 시행일 병기", () => {
    const m = L.matchLawArticles("항공안전법 제122조")!
    ok(!L.renderLawBlock(m, new Date("2026-11-03T00:00:00Z")).includes("지나"), "신선한데 경고")
    ok(L.renderLawBlock(m, new Date("2026-11-20T00:00:00Z")).includes("수집한 지 19일이 지나"), "낡았는데 경고 없음")
    ok(L.renderLawBlock(m, new Date("2026-01-05T00:00:00Z")).includes("시행 예정"), "시행 예정 표시 없음")
    ok(L.renderLawBlock(m, new Date("2026-11-02T00:00:00Z")).includes("시행 2026-09-17") && !L.renderLawBlock(m, new Date("2026-11-02T00:00:00Z")).includes("시행 예정"), "시행 중인데 예정 표시")
    ok(L.renderLawBlock(L.matchLawArticles("항공안전법 시행령 제26조")!, new Date("2026-11-02T00:00:00Z")).includes("일부는 2026-07-09 시행"), "부분 시행 병기")
  })

  await t("L7 길이 상한: 매칭이 많아도 블록이 상한을 넘지 않고 생략 건수를 알린다", () => {
    const big = claims.filter((a) => a.text.length > 1500).slice(0, 8)
    const text = L.renderLawBlock({ articles: big, missing: [], direct: true, omitted: 0 })
    const quoted = text.split("\n").filter((l) => l.startsWith("> ")).join("\n").length
    ok(quoted < 7000 + 3000, `인용 ${quoted}자`)
    ok(big.reduce((n, a) => n + a.text.length, 0) <= 7000 || text.includes("표시하지 못한 관련 조문이"), "생략 안내 없음")
    const many = L.matchLawArticles("초경량비행장치 신고 비행승인 조종자 증명 안전성인증 변경신고 말소신고")!
    ok(many.articles.length <= 8, `상한 8 초과 ${many.articles.length}`)
  })

  await t("L8 플래그: KG_LAW_TEXT=1 일 때만 켜진다(기본 off)", () => {
    const keep = process.env.KG_LAW_TEXT
    delete process.env.KG_LAW_TEXT; ok(!L.lawTextEnabled(), "기본이 켜짐")
    process.env.KG_LAW_TEXT = "0"; ok(!L.lawTextEnabled(), "0 이 켜짐")
    process.env.KG_LAW_TEXT = "1"; ok(L.lawTextEnabled(), "1 이 꺼짐")
    if (keep === undefined) delete process.env.KG_LAW_TEXT; else process.env.KG_LAW_TEXT = keep
  })

  await t("L9 라우트 연결: 플래그 뒤·모델 호출 전에만 조문 답변을 내고, 플래그가 꺼지면 기존 경로", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf-8")
    ok(/lawTextEnabled\(\) \? await lawTextAnswerSelected\(question\) : null/.test(src), "플래그 가드 없음")
    ok(src.indexOf("lawTextAnswerSelected(question)") < src.indexOf("streamText({ model: wikiModel(profileOf(tier))"), "모델 호출 뒤에 있음")
    ok(src.indexOf("lawTextAnswerSelected(question)") < src.indexOf('if (plan.status !== "ready")'), "근거 부족 판정보다 뒤에 있음")
  })

  await t("L10 선택기: 코드 파싱·검증(목록 밖·형식 오류는 실패), 규칙 대체·직접 지정 우선·없음 처리, 모델 출력이 조문이 되지 않는다", async () => {
    const S = await import("../lib/law-select")
    ok(JSON.stringify(S.parseCodes('{"codes":["L01","L02"]}')) === "[1,2]" && JSON.stringify(S.parseCodes("{\"codes\":['L05']}")) === "[5]", "정상 파싱")
    ok(S.parseCodes('{"codes":[]}')?.length === 0, "빈 목록")
    ok(S.parseCodes('{"codes":["L99"]}') === null && S.parseCodes('{"codes":["312"]}') === null && S.parseCodes('{"codes":["L12","제122조"]}') === null && S.parseCodes("그냥 문장") === null && S.parseCodes('{"codes":["L01","L02"') === null, "목록 밖·번호·잘림·비JSON 은 실패")
    ok(S.parseCodes('{"codes":["L01","L01","L02","L03","L04","L05","L06","L07"]}')!.length === 5, "상한 5·중복 제거")
    const now = new Date("2026-11-02T00:00:00Z")
    const gen = (out: string) => async () => out
    const idx = claims.findIndex((a) => a.id === "LAW-aviation-safety-act-122") + 1
    const code = `L${String(idx).padStart(2, "0")}`
    const sel = await S.lawTextAnswerSelected("드론 기체 문제 있으면 어디에 알려야 해", { generate: gen(`{"codes":["${code}"]}`), now })
    ok(sel?.via === "selector" && sel.ids.join() === "LAW-aviation-safety-act-122" && sel.text.includes("> 제122조(초경량비행장치 신고)"), "선택기 경로")
    ok((await S.lawTextAnswerSelected("신고 어디서 해", { generate: gen('{"codes":[]}'), now })) === null, "없음이면 조문 없음(규칙으로 되돌아가지 않음)")
    const fb = await S.lawTextAnswerSelected("초경량비행장치 신고는 어디서 해?", { generate: gen("형식 깨짐"), now })
    ok(fb?.via === "rules" && fb.ids.includes("LAW-aviation-safety-act-122"), "형식 오류 → 규칙 대체")
    const boom = await S.lawTextAnswerSelected("초경량비행장치 신고는 어디서 해?", { generate: async () => { throw new Error("x") }, now })
    ok(boom?.via === "rules", "호출 예외 → 규칙 대체")
    const slow = await S.lawTextAnswerSelected("초경량비행장치 신고는 어디서 해?", { generate: () => new Promise((r) => setTimeout(() => r("{}"), 200)), timeoutMs: 20, now })
    ok(slow?.via === "rules", "시간 초과 → 규칙 대체")
    let called = 0
    const direct = await S.lawTextAnswerSelected("항공안전법 제122조", { generate: async () => { called++; return '{"codes":[]}' }, now })
    ok(direct?.via === "direct" && called === 0, "직접 지정은 모델을 부르지 않음")
    ok((await S.lawTextAnswerSelected("PX4 EKF2 튜닝 팁", { generate: async () => { called++; return '{"codes":["L01"]}' }, now })) === null && called === 0, "법령어 없는 질문은 모델을 부르지 않음")
    ok(S.SELECT_SYSTEM.includes("[L80]") && !S.SELECT_SYSTEM.includes("[L81]") && claims.length === 80, "목록 80건")
    ok(!S.SELECT_SYSTEM.includes(claims[0].text.slice(0, 40)), "프롬프트에 조문 본문이 들어감(제목만 허용)")
  })

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
