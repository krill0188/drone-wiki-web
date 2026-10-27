// 신선도(시점 인식) 시험 — 설계서 docs/dikw-dynamic-ontology-design.md §7 Phase 1 게이트.
// 실행: npx tsx scripts/test-freshness.ts   (NIM 호출 없음, 지식 DB만 사용)
import { freshnessOf, freshnessRowValue, FRESH_LIMIT_DAYS, FRESHNESS_CONSTRAINT } from "../lib/freshness"

type Result = { name: string; status: "PASS" | "FAIL"; note?: string }
const results: Result[] = []
const t = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try { const note = await fn(); results.push({ name, status: "PASS", note: note || undefined }) }
  catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) }
}
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const NOW = new Date("2026-10-27T12:00:00Z")
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString().slice(0, 10)

async function main() {
  // ── 순수 함수 ──
  await t("F1 spec 경계: 90일 fresh / 91일 aging / 180일 aging / 181일 stale", () => {
    const f = (d: number) => freshnessOf(ago(d), "spec", NOW)!.freshness
    ok(f(0) === "fresh" && f(90) === "fresh", `0/90=${f(0)}/${f(90)}`)
    ok(f(91) === "aging" && f(180) === "aging", `91/180=${f(91)}/${f(180)}`)
    ok(f(181) === "stale", `181=${f(181)}`)
  })
  await t("F2 volatile 경계: 7 fresh / 8 aging / 30 aging / 31 stale", () => {
    const f = (d: number) => freshnessOf(ago(d), "volatile", NOW)!.freshness
    ok(f(7) === "fresh" && f(8) === "aging" && f(30) === "aging" && f(31) === "stale", `${f(7)}/${f(8)}/${f(30)}/${f(31)}`)
  })
  await t("F3 as_of 없음·형식 오류·존재하지 않는 날짜 → unknown", () => {
    for (const v of [null, undefined, "", "어제", "2026/10/19", "2026-02-30", "2026-13-01"]) ok(freshnessOf(v as string | null, "spec", NOW)!.freshness === "unknown", `입력 ${String(v)}`)
  })
  await t("F4 미래 기준일 → unknown(거짓 신선도 금지)", () => {
    const r = freshnessOf("2026-10-28", "spec", NOW)!
    ok(r.freshness === "unknown" && r.ageDays === null, JSON.stringify(r))
  })
  await t("F5 static은 null(표시 안 함)", () => ok(freshnessOf(ago(5000), "static", NOW) === null, "static이 판정됨"))
  await t("F6 시각이 붙은 ISO 문자열도 날짜만 본다", () => ok(freshnessOf("2026-10-19T09:00:00+09:00", "spec", NOW)!.ageDays === 8, "ageDays≠8"))
  await t("F7 임계값 상수는 설계 D2와 일치(spec 90/180, volatile 7/30)", () => {
    ok(FRESH_LIMIT_DAYS.spec.fresh === 90 && FRESH_LIMIT_DAYS.spec.aging === 180 && FRESH_LIMIT_DAYS.volatile.fresh === 7 && FRESH_LIMIT_DAYS.volatile.aging === 30, JSON.stringify(FRESH_LIMIT_DAYS))
  })
  await t("F8 표 값: fresh는 날짜만, 나머지는 ⚠·재확인 문구", () => {
    ok(freshnessRowValue("2026-10-19", "fresh", 8) === "2026-10-19 (8일 경과)", freshnessRowValue("2026-10-19", "fresh", 8))
    ok(freshnessRowValue("2026-01-01", "stale", 299).startsWith("⚠") && freshnessRowValue("2026-01-01", "stale", 299).includes("재확인"), "stale 문구")
    ok(freshnessRowValue(undefined, "unknown", undefined).includes("미상"), "unknown 문구")
  })

  // ── 통합(지식 DB) ──
  const { planQuery } = await import("../lib/kg-plan")
  const { buildNimContext } = await import("../lib/kg-context")
  const { renderEntityTables } = await import("../lib/kg-table")
  const { all } = await import("../lib/kdb")
  const Q = "Gens ace 5000mAh 4S 사양 알려줘"
  const strip = (a: Record<string, unknown>) => { const { as_of, freshness, volatility, age_days, ...rest } = a; void as_of; void freshness; void volatility; void age_days; return rest }

  await t("F9 플래그 off: 제품 속성에 신선도 키 0건, 제약 목록 불변, 표에 기준일 행 없음", () => {
    delete process.env.KG_FRESHNESS
    const p = planQuery(Q)
    const prods = p.entities.filter((e) => e.attributes.category)
    ok(prods.length > 0, "제품 개체 연결 실패")
    for (const e of prods) ok(!("as_of" in e.attributes) && !("freshness" in e.attributes) && !("age_days" in e.attributes) && !("volatility" in e.attributes), `${e.id}에 신선도 키`)
    ok(!buildNimContext(p).answer_constraints.includes(FRESHNESS_CONSTRAINT), "제약이 off인데 추가됨")
    ok(!renderEntityTables(p).includes("수집 기준일"), "표에 기준일 행")
    return `제품 ${prods.length}개`
  })

  await t("F10 플래그 on: 신선도 키 외 속성은 off와 완전히 동일(기존 사실 불변)", () => {
    delete process.env.KG_FRESHNESS
    const off = planQuery(Q)
    process.env.KG_FRESHNESS = "1"
    const on = planQuery(Q)
    delete process.env.KG_FRESHNESS
    ok(off.entities.length === on.entities.length, "개체 수 변동")
    off.entities.forEach((e, i) => ok(JSON.stringify(strip(e.attributes)) === JSON.stringify(strip(on.entities[i].attributes)), `${e.id} 속성 변동`))
    ok(JSON.stringify(off.relations) === JSON.stringify(on.relations) && JSON.stringify(off.claims) === JSON.stringify(on.claims), "관계·claim 변동")
  })

  await t("F11 플래그 on: 모든 제품의 as_of가 DB captured와 일치하고 빌드 날짜로 대체되지 않음", () => {
    process.env.KG_FRESHNESS = "1"
    const p = planQuery(Q)
    delete process.env.KG_FRESHNESS
    const prods = p.entities.filter((e) => e.attributes.category)
    for (const e of prods) {
      const cap = all<{ captured: string }>("SELECT captured FROM products WHERE id = ?", e.id)[0]?.captured
      ok(cap && e.attributes.as_of === cap, `${e.id}: as_of=${e.attributes.as_of} DB=${cap}`)
      ok(e.attributes.volatility === "spec" && typeof e.attributes.age_days === "number", `${e.id} 메타`)
    }
    return `제품 ${prods.length}개 일치`
  })

  await t("F12 플래그 on: 제약 목록에 신선도 규칙, 표에 기준일 행(제품당 1행), 제조사 개체엔 없음", () => {
    process.env.KG_FRESHNESS = "1"
    const p = planQuery(Q)
    const ctx = buildNimContext(p)
    const table = renderEntityTables(p, 4)
    delete process.env.KG_FRESHNESS
    ok(ctx.answer_constraints.includes(FRESHNESS_CONSTRAINT), "제약 누락")
    const mfr = ctx.ontology_entities.find((e) => !e.attributes.category)
    ok(!mfr || !("freshness" in mfr.attributes), "제품이 아닌 개체에 신선도")
    // 표 본문에도 빈 줄이 있으므로 '\n\n**제품명**' 머리글 기준으로만 쪼갠다
    const tables = table.split(/\n\n(?=\*\*)/).filter((s) => s.includes("제품 사양표"))
    ok(tables.length > 0 && tables.every((s) => (s.match(/\| 수집 기준일 \|/g) ?? []).length === 1), "표마다 기준일 행 정확히 1개 필요")
    return `표 ${tables.length}개`
  })

  await t("F12b 제품 없는 질문: 플래그 on이어도 시스템 프롬프트가 off와 바이트 동일(영향 범위 최소화)", async () => {
    const { nimSystemPrompt } = await import("../lib/kg-context")
    for (const q of ["호버 전력이 무게에 따라 어떻게 변해?", "전진 비행 시 전력 소비는 호버보다 낮아?", "PX4와 ArduPilot의 차이점은?", "배터리 에너지 밀도 근거"]) {
      delete process.env.KG_FRESHNESS
      const off = nimSystemPrompt(buildNimContext(planQuery(q)), "text")
      process.env.KG_FRESHNESS = "1"
      const on = nimSystemPrompt(buildNimContext(planQuery(q)), "text")
      delete process.env.KG_FRESHNESS
      ok(off === on, `[${q}] 프롬프트가 플래그에 따라 달라짐`)
    }
  })

  await t("F12c 표 안내문구('질문과 관련된 항목만 표시')가 기준일 행 때문에 사라지지 않는다(경계: 관련 행 = 전체 -1)", () => {
    const entity = { id: "product-x", label: "Test Product", cls: "Motor", alias: "test product", attributes: { weight_g: 77, capacity_mah: 770, cells_s: 1770, nominal_v: 7700, continuous_a: 5 } as Record<string, string | number | null> }
    const mk = (fresh: boolean) => ({ question: "77 알려줘", entities: [{ ...entity, attributes: { ...entity.attributes, ...(fresh ? { as_of: "2026-10-19", freshness: "fresh", age_days: 8 } : {}) } }] }) as unknown as Parameters<typeof renderEntityTables>[0]
    const off = renderEntityTables(mk(false)), on = renderEntityTables(mk(true))
    ok(off.includes("질문과 관련된 항목만 표시"), "전제 실패: off에서 안내문구가 없음(시험 데이터 점검)")
    ok(on.includes("질문과 관련된 항목만 표시"), "on에서 안내문구 소실")
    ok(on.includes("| 수집 기준일 |"), "기준일 행 누락")
  })

  await t("F13 모의 시계(+200일): 같은 제품이 stale로 표시되고 재확인 문구가 표에 나온다", () => {
    const cap = all<{ captured: string }>("SELECT captured FROM products WHERE captured IS NOT NULL LIMIT 1")[0].captured
    const future = new Date(new Date(cap + "T00:00:00Z").getTime() + 200 * 86_400_000)
    const r = freshnessOf(cap, "spec", future)!
    ok(r.freshness === "stale" && r.ageDays === 200, JSON.stringify(r))
    ok(freshnessRowValue(cap, r.freshness, r.ageDays).includes("재확인"), "문구")
  })

  await t("F14 후검증: context에 있는 기준일은 통과, 없는 날짜·경과일은 unsupported_number", async () => {
    process.env.KG_FRESHNESS = "1"
    const p = planQuery(Q)
    const ctx = buildNimContext(p)
    delete process.env.KG_FRESHNESS
    const { unsupportedNumbers } = await import("../lib/kg-verify")
    const e = ctx.ontology_entities.find((x) => x.attributes.as_of)!
    const asOf = String(e.attributes.as_of), age = e.attributes.age_days
    ok(unsupportedNumbers(`수집 기준일은 ${asOf}, 경과 ${age}일입니다.`, ctx).size === 0, "정상 기준일이 위반 처리됨")
    ok(unsupportedNumbers("수집 기준일은 2026-09-03, 경과 77일입니다.", ctx).size > 0, "지어낸 날짜가 통과됨")
  })

  // ── 골든셋(오프라인·결정론): 12개 제품 카테고리 전부에서 DB 제품을 균등 간격으로 골라 질문을 만든다. 설계서 §7 "제품 질문 20건 이상" ──
  // 임의로 지은 모델명은 카탈로그에 없어 연결되지 않으므로(첫 시도 8/25) 질문은 실제 DB 제품명에서 파생한다. 스냅샷이 바뀌면 질문도 따라 바뀐다.
  const picked = all<{ category: string; name: string }>("SELECT category, name FROM products ORDER BY category, id")
  const byCat = new Map<string, string[]>()
  for (const r of picked) (byCat.get(r.category) ?? byCat.set(r.category, []).get(r.category)!).push(r.name.split(" | ")[0].trim())
  const GOLDEN = [...byCat.values()].flatMap((names) => [0, 0.5, 0.9].map((f) => names[Math.floor(f * (names.length - 1))]).filter((n, i, a) => a.indexOf(n) === i)).map((n) => `${n} 사양 알려줘`)
  await t("F15 골든셋: 제품이 연결되는 질문 20건 이상에서 on/off 사실 동일·as_of=DB·표 기준일 1행", () => {
    let hit = 0, prodTotal = 0
    const missed: string[] = []
    for (const q of GOLDEN) {
      delete process.env.KG_FRESHNESS
      const off = planQuery(q)
      process.env.KG_FRESHNESS = "1"
      const on = planQuery(q)
      const table = renderEntityTables(on, 4)
      delete process.env.KG_FRESHNESS
      const prods = on.entities.filter((e) => e.attributes.category)
      if (!prods.length) { missed.push(q); continue }
      hit++; prodTotal += prods.length
      off.entities.forEach((e, i) => ok(JSON.stringify(strip(e.attributes)) === JSON.stringify(strip(on.entities[i].attributes)), `[${q}] ${e.id} 속성 변동`))
      for (const e of prods) {
        const cap = all<{ captured: string }>("SELECT captured FROM products WHERE id = ?", e.id)[0]?.captured
        ok(e.attributes.as_of === cap, `[${q}] ${e.id} as_of=${e.attributes.as_of} DB=${cap}`)
      }
      const tables = table.split(/\n\n(?=\*\*)/).filter((s) => s.includes("제품 사양표"))
      ok(tables.every((s) => (s.match(/\| 수집 기준일 \|/g) ?? []).length === 1), `[${q}] 표 기준일 행`)
    }
    ok(hit >= 20, `제품 연결 질문 ${hit}건(<20) — 미연결: ${missed.join(" / ")}`)
    return `질문 ${hit}/${GOLDEN.length}건, 제품 ${prodTotal}개${missed.length ? ` · 미연결 ${missed.length}건(${missed.join(" / ")})` : ""}`
  })

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status === "PASS" ? "PASS" : "FAIL"}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
