export {} // 전역 스크립트로 취급되어 다른 시험의 t·ok 와 충돌하지 않도록 모듈로 만든다
// 펌웨어(PX4·ArduPilot) 선택·비교 질문 검색 시험 — 오프라인(모델 호출 없음), KG_BACKEND=sqlite.
// 배경(2026-10-31): 기체 유형별로 어떤 펌웨어가 유리한지 묻는 질문에서 ①검증 claim 이 없고 ②고정익·VTOL 낱말에 무관한 공학 규칙 claim 이 딸려 오고
// ③'유리한지·비교하고' 같은 요청 낱말이 "근거를 못 찾았다"로 보고되어 모델이 핵심을 답하지 않았다.
// 실행: KG_BACKEND=sqlite npx tsx scripts/test-fw-selection.ts
import fs from "node:fs"
import path from "node:path"

process.env.KG_BACKEND = "sqlite"
type Result = { name: string; status: "PASS" | "FAIL"; note?: string }
const results: Result[] = []
const t = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try { const note = await fn(); results.push({ name, status: "PASS", note: note || undefined }) }
  catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) }
}
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const ROOT = path.join(__dirname, "..")

async function main() {
  const { planQuery, firmwareSelection } = await import("../lib/kg-plan")
  const { all } = await import("../lib/kdb")
  const isFw = (id: string) => id.startsWith("FW")

  const SELECTION = [
    "FC 펌웨어로 PX4와 ArduPilot 중 고정익, 회전익, 멀티콥터 각각 어느 쪽이 유리한지 기체 성격별로 비교하고 선택 기준을 알려줘",
    "고정익 VTOL 멀티콥터 각각 PX4 ArduPilot 중 어떤 펌웨어를 쓰는 게 좋아?",
    "PX4와 ArduPilot 라이선스 차이는?",
    "VTOL 기체에는 PX4와 ArduPilot 중 뭐가 적합해?",
    "펌웨어 선택할 때 멀티콥터와 고정익은 어떻게 달라?",
  ]
  const NOT_SELECTION = [
    "PX4 EKF2 지연 기본값은?", "ArduPilot 설치 방법을 단계별로 알려줘", "PX4가 뭐야?", "Jetson Orin Nano에서 NanoSAM 지연은?", "MAVLink가 뭐야?",
    "고정익 장시간 비행 에너지 설계는 어떻게 해?", "멀티콥터 호버링 전력은 어떻게 계산해?",
    // QA 지적(2026-10-31): '달라·차이·비교'가 있어도 파라미터·설치·로그·지연 비교는 선택 질문이 아니다(선택 가이드 claim 이 섞이면 모델이 오도됨)
    "ArduPilot EKF3 파라미터는 PX4와 어떻게 달라?", "PX4와 ArduPilot 설치 방법 차이는?", "PX4 ArduPilot 지연 시간 비교", "ArduPilot 로그 형식은 PX4와 뭐가 달라?",
  ]

  await t("F1 선택 판정: 펌웨어 낱말 + 선택·비교 낱말일 때만 true (설치·파라미터·정의·공학 질문은 false)", () => {
    for (const q of SELECTION) ok(firmwareSelection(q), `선택 질문인데 false: ${q}`)
    for (const q of NOT_SELECTION) ok(!firmwareSelection(q), `선택 질문이 아닌데 true: ${q}`)
    ok(!firmwareSelection("고정익과 멀티콥터 중 뭐가 유리해?"), "펌웨어 낱말이 없는데 true(기체 유형 선택은 이 경로가 아님)")
  })

  await t("F2 선택·비교 질문: 검증된 FW claim 이 근거로 선택되고(≥12건), 무관한 공학 규칙·논문 claim 은 0건", () => {
    for (const q of SELECTION) {
      const p = planQuery(q)
      const fw = p.claims.filter((c: { id: string }) => isFw(c.id)).length
      const other = p.claims.filter((c: { id: string }) => !isFw(c.id)).map((c: { id: string }) => c.id)
      ok(p.status === "ready" && p.basis === "ontology", `상태/기반 이상(${p.status}/${p.basis}): ${q}`)
      ok(fw >= 12, `FW claim ${fw}건뿐: ${q}`)
      ok(other.length === 0, `무관한 claim 유입 ${other.join(",")}: ${q}`)
    }
  })

  await t("F3 한계 문구: '유리한지·비교하고·각각·성격별' 같은 요청 낱말을 '찾지 못한 내용'으로 보고하지 않는다", () => {
    const REQ = ["유리한지", "비교하고", "각각", "성격별", "적합해", "달라", "좋아"]
    for (const q of SELECTION) {
      const p = planQuery(q)
      const lim = p.limitations.filter((l: string) => l.includes("찾지 못했습니다"))
      for (const l of lim) for (const w of REQ) ok(!l.includes(`'${w}'`), `요청 낱말이 빠진 내용으로 보고됨('${w}'): ${l}`)
    }
  })

  await t("F3b 요청 낱말 판정: 요청·평가 낱말(유리한지·비교하고·각각·성격별…)은 제외하고, 실제 주제어(양자컴퓨터·EKF2·고정익·ArduPilot)는 제외하지 않는다", async () => {
    const { isRequestToken } = await import("../lib/kg-plan")
    const tok = (w: string) => ({ orig: w, variants: [w] })
    for (const w of ["유리한지", "비교하고", "각각", "성격별", "적합해", "정리해줘", "단계별", "주의점", "뭐예요"]) ok(isRequestToken(tok(w)), `요청 낱말인데 제외되지 않음: ${w}`)
    for (const w of ["양자컴퓨터", "ekf2", "고정익", "ardupilot", "px4", "tailsitter", "라이선스", "mavlink"]) ok(!isRequestToken(tok(w)), `주제어가 요청 낱말로 제외됨: ${w}`)
  })

  await t("F4 통제: 선택·비교가 아닌 질문에는 FW claim 이 섞이지 않는다", () => {
    for (const q of NOT_SELECTION) {
      const p = planQuery(q)
      const fw = p.claims.filter((c: { id: string }) => isFw(c.id))
      ok(fw.length === 0, `FW claim 유입 ${fw.length}건: ${q}`)
    }
  })

  await t("F5 통제: 공학 질문은 기존처럼 규칙 연결 claim 을 받는다(고정익 에너지·멀티콥터 호버링)", () => {
    for (const q of ["고정익 장시간 비행 에너지 설계는 어떻게 해?", "멀티콥터 호버링 전력은 어떻게 계산해?"]) {
      const p = planQuery(q)
      ok(p.claims.length > 0 && p.claims.some((c: { rules?: string[] }) => (c.rules ?? []).length > 0), `규칙 claim 이 사라짐: ${q}`)
    }
  })

  await t("F6 데이터 무결성: FW claim 은 모두 verified·manufacturer·topic 지정, 증거 verified, 출처는 공개 https URL, 인용문 존재", () => {
    const rows = all<{ id: string; status: string; origin: string; topic: string }>("SELECT id, status, origin, topic FROM claims WHERE id LIKE 'FW%' ORDER BY id")
    ok(rows.length >= 29, `FW claim ${rows.length}건(≥29 기대)`)
    for (const r of rows) ok(r.status === "verified" && r.origin === "manufacturer" && r.topic === "firmware-selection", `상태 이상 ${r.id}: ${r.status}/${r.origin}/${r.topic}`)
    const ev = all<{ claim_id: string; verified: number; quote: string; url: string | null; sha: string }>(
      "SELECT e.claim_id, e.verified, e.quote, s.source_url AS url, s.sha256 AS sha FROM evidence e JOIN sources s ON s.id = e.source_id WHERE e.claim_id LIKE 'FW%'")
    ok(ev.length === rows.length, `증거 ${ev.length}건 ≠ claim ${rows.length}건`)
    for (const e of ev) {
      ok(e.verified === 1, `증거 미검증 ${e.claim_id}`)
      ok(e.sha === "", `웹 문서 출처에 제품 카탈로그 해시가 기록됨(감사 추적 오기록) ${e.claim_id}`)
      ok(!!e.quote && e.quote.length <= 260, `인용문 이상 ${e.claim_id}`)
      ok(!!e.url && /^https:\/\/[a-z0-9.-]+\//.test(e.url), `출처 URL 없음/이상 ${e.claim_id}: ${e.url}`)
    }
    return `${rows.length}건, 증거 ${ev.length}건 전부 verified·URL 보유`
  })

  await t("F7 데이터 원본: claims.json 의 FW 계열 id 유일·topic 일치·같은 id 가 다른 파일에 중복 없음", () => {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ontology", f), "utf-8")).claims as { id: string; topic?: string; quote?: string }[]
    const fw = read("claims.json").filter((c) => isFw(c.id))
    ok(new Set(fw.map((c) => c.id)).size === fw.length && fw.length >= 29, `FW id 중복/부족: ${fw.length}`)
    ok(fw.every((c) => c.topic === "firmware-selection" && !!c.quote), "topic/인용문 누락")
    for (const f of ["paper-claims.json", "auto-claims.json"]) ok(!read(f).some((c) => isFw(c.id)), `${f} 에 FW id 중복`)
  })

  await t("F8 프롬프트: 선택·비교 질문에만 6-4 규칙(빈 칸 추측 금지)이 붙고, 그 밖의 질문 프롬프트는 이 규칙을 담지 않는다", async () => {
    const { buildNimContext, nimSystemPrompt, FIRMWARE_SELECTION_RULE } = await import("../lib/kg-context")
    const prompt = (q: string) => nimSystemPrompt(buildNimContext(planQuery(q)), "text")
    for (const q of SELECTION) {
      const p = prompt(q)
      ok(p.includes(FIRMWARE_SELECTION_RULE), `6-4 규칙 누락: ${q}`)
      ok(p.includes("근거 없음") && p.includes("추가 플러그인 필요") && p.includes("한국어로 쓰되"), `규칙 핵심 문구 누락: ${q}`)
      // 줄 시작 마커로 찾는다(컨텍스트 JSON 안의 '9.' 같은 숫자와 겹치지 않도록)
      const at = (m: string) => p.indexOf(m)
      ok(at("\n6-4. ") > at("\n9. ") && at("\n6-4. ") < at("\n8. "), "규칙 위치(규칙 목록 끝, 출력 형식 8 앞)")
    }
    for (const q of NOT_SELECTION) ok(!prompt(q).includes("6-4."), `선택·비교가 아닌데 6-4 규칙이 붙음: ${q}`)
    ok(FIRMWARE_SELECTION_RULE.endsWith("\n"), "규칙 문자열이 개행으로 끝나지 않으면 다음 규칙과 한 줄로 붙는다")
  })

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
