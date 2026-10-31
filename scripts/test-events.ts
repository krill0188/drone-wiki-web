// 동향 이벤트 레이어 시험 — 설계서 docs/dikw-dynamic-ontology-design.md §7 Phase 2 게이트.
// 실행: npx tsx scripts/test-events.ts   (NIM 호출 없음)
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

type Result = { name: string; status: "PASS" | "FAIL"; note?: string }
const results: Result[] = []
const t = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try { const note = await fn(); results.push({ name, status: "PASS", note: note || undefined }) }
  catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) }
}
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const ROOT = path.join(__dirname, "..")
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf-8"))
const DAY = 86_400_000

async function main() {
  const ev = read("data/ontology/events.json") as { generated: string; window_days: number; events: Record<string, string>[]; links: { event: string; node: string; nodeType: string; predicate: string }[] }
  const graph = read("data/ontology/graph.json") as { nodes: { id: string; type: string; label: string }[] }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const evById = new Map(ev.events.map((e) => [e.id, e]))

  await t("E1 데이터 형식: 허용 필드만(summary 없음), 전부 unverified, URL은 http(s), ID 중복 없음", () => {
    const allowed = ["domain", "eventType", "id", "published", "source", "status", "title", "type", "url"]
    for (const e of ev.events) {
      ok(JSON.stringify(Object.keys(e).sort()) === JSON.stringify(allowed), `필드 불일치 ${e.id}: ${Object.keys(e)}`)
      ok(e.status === "unverified" && e.type === "Event", `${e.id} status/type`)
      ok(/^https?:\/\//.test(e.url), `${e.id} url`)
    }
    ok(new Set(ev.events.map((e) => e.id)).size === ev.events.length, "ID 중복")
    return `${ev.events.length}건`
  })

  const lawsReal = read("data/ontology/laws.json") as { confirmed?: boolean; topics: Record<string, string[]>; laws: { id: string; name: string; aliases: string[]; topics: string[] }[] }
  const lawIds = new Set(lawsReal.laws.map((l) => l.id))
  const LAW_PREFIX = "[법령] "
  const lawWindow = (ev as { law_window_days?: number }).law_window_days ?? 365

  await t("E2 기간 창: 일반 이벤트는 90일, 법령 이벤트는 law_window_days(365일) 이내이고 미래가 아님", () => {
    const g = Date.parse(ev.generated)
    for (const e of ev.events) {
      const p = Date.parse(e.published)
      const days = e.eventType === "regulation" && e.title.startsWith(LAW_PREFIX) ? lawWindow : ev.window_days
      ok(Number.isFinite(p) && p <= g && g - p <= days * DAY, `${e.id} published=${e.published} generated=${ev.generated}`)
    }
  })

  await t("E3 링크 무결성: 이벤트·노드가 실제로 존재하고, 노드 유형이 링크 유형과 일치(Law는 laws.json ID)", () => {
    for (const l of ev.links) {
      ok(evById.has(l.event), `없는 이벤트 ${l.event}`)
      if (l.nodeType === "Law") { ok(lawIds.has(l.node) && l.predicate === "mentions", `법령 링크 노드 ${l.node}`); continue }
      const n = nodeById.get(l.node)
      ok(n && n.type === l.nodeType && l.predicate === "mentions", `링크 노드 ${l.node}`)
    }
    return `링크 ${ev.links.length}건`
  })

  await t("E4 링크 정밀도(전수): 모든 링크의 제조사 이름이 이벤트 제목에 실제로 들어 있다", () => {
    const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `
    for (const l of ev.links) {
      if (l.nodeType === "Law") continue // 법령 링크는 L2가 따로 검증한다
      const e = evById.get(l.event)!, n = nodeById.get(l.node)!
      const base = n.label.replace(/\(.*?\)/g, " ")
      const names = [base, ...(n.label.match(/\((.*?)\)/g) ?? []).map((x) => x.slice(1, -1)), ...base.split(/[/,]/)].map((x) => norm(x).trim()).filter((x) => x.length >= 3)
      ok(names.some((x) => norm(e.title).includes(` ${x} `)), `제목에 제조사명 없음: [${n.label}] ${e.title}`)
    }
  })

  await t("E5 골든(수동 검토 확정): 반드시 링크 / 절대 링크 금지", () => {
    const labelsOf = (re: RegExp) => ev.events.filter((e) => re.test(e.title)).map((e) => ({ e, linked: ev.links.filter((l) => l.event === e.id).map((l) => nodeById.get(l.node)!.label) }))
    const must: [RegExp, string][] = [[/DJI updates Mini 5 Pro/, "DJI"], [/Skydio unveils the F10/, "Skydio"], [/Parrot Strengthens/, "Parrot"], [/\[Auterion\] Auterion in Ukraine/, "Auterion"],
      // 2026-10-30 피드 기준으로 제목을 직접 검토해 추가한 골든(제조사명이 제목에 단독으로 명확히 나오는 기사)
      [/DJI Modify 1\.7\.0 adds new ways/, "DJI"], [/Royal Navy opens tender for Skydio X10D/, "Skydio"], [/Quantum Systems Establishes Japanese Subsidiary/, "Quantum-Systems"], [/Luxonis OAK 4 FFC/, "Luxonis"]]
    // 골든 기사는 실제 피드에서 뽑은 것이라 피드가 갱신되면 90일 창·500건 상한 밖으로 밀려날 수 있다(그 자체는 버그가 아니다).
    // 데이터에 있는 골든은 반드시 링크돼야 하고, 밀려난 것은 건너뛰되 시험이 공허해지지 않도록 최소 2건은 남아 있어야 한다.
    const skipped: string[] = []
    for (const [re, label] of must) {
      const rows = labelsOf(re)
      if (rows.length === 0) { skipped.push(label); continue }
      for (const r of rows) ok(r.linked.includes(label), `${label} 링크 누락: ${r.e.title}`)
    }
    ok(must.length - skipped.length >= 2, `검증 가능한 골든이 ${must.length - skipped.length}건뿐(건너뜀: ${skipped.join(", ")}) — 골든 목록을 현재 피드 기준으로 갱신할 것`)
    // 'DJI 비교' 나열 기사에서도 DJI는 정당하지만, DJI 제목이 Skydio 등 엉뚱한 제조사에 붙으면 안 된다
    for (const r of labelsOf(/^\[DJI\]/)) ok(r.linked.every((x) => x === "DJI"), `[DJI] 영상이 다른 제조사에 링크됨: ${r.linked}`)
    // 제조사명이 없는 일반 기사는 링크가 없어야 한다
    for (const r of labelsOf(/^(Drone|Drones|FAA|Pentagon)\b/)) ok(r.linked.length === 0 || /DJI|Skydio|Parrot/.test(r.e.title), `일반 기사 오링크: ${r.e.title} → ${r.linked}`)
  })

  await t("E6 결정론: 같은 입력으로 다시 빌드하면 events.json과 바이트 동일", () => {
    const feed = path.join(os.homedir(), "2nd", ".ua", "news-feed.json")
    if (!fs.existsSync(feed)) return "SKIP(피드 없음)"
    // 피드가 이번 생성 이후 갱신됐을 수 있으므로, 같은 입력을 두 번 빌드해 서로 비교한다(저장된 파일과의 비교가 아님)
    const a = path.join(os.tmpdir(), `ev-a-${process.pid}.json`), b = path.join(os.tmpdir(), `ev-b-${process.pid}.json`)
    for (const out of [a, b]) {
      const r = spawnSync("python3", ["-I", path.join(ROOT, "scripts", "build-events.py"), "--out", out], { encoding: "utf-8" })
      ok(r.status === 0, `빌더 실패: ${r.stderr}`)
    }
    const same = fs.readFileSync(a).equals(fs.readFileSync(b))
    fs.rmSync(a, { force: true }); fs.rmSync(b, { force: true })
    ok(same, "두 번 빌드 결과가 다름")
  })

  const { eventsEnabled, relatedEventsFor } = await import("../lib/events")
  const { planQuery } = await import("../lib/kg-plan")
  const { all } = await import("../lib/kdb")
  const dji = all<{ name: string }>("SELECT name FROM products WHERE manufacturer_id = (SELECT id FROM manufacturers WHERE name = 'DJI') ORDER BY id LIMIT 1")[0]
  const Q = dji ? `${dji.name.split(" | ")[0]} 사양 알려줘` : ""

  await t("E7 조회: DJI 제품 질문 → 최대 3건, 최신순, 전부 DJI 링크 / 무관 개체는 0건", () => {
    ok(Q, "DB에 DJI 제품 없음")
    const p = planQuery(Q)
    const NOW = new Date(ev.generated + "T12:00:00Z")
    const r = relatedEventsFor(p.entities, 3, NOW)
    ok(r.length > 0 && r.length <= 3, `건수 ${r.length}`)
    const rk = (x: { eventType: string }) => (x.eventType === "video" ? 1 : 0)
    ok(r.every((x, i) => i === 0 || rk(r[i - 1]) < rk(x) || (rk(r[i - 1]) === rk(x) && r[i - 1].published >= x.published)), "순서 규칙(영상은 뒤, 같은 묶음은 최신순) 위반")
    const pool = relatedEventsFor(p.entities, 99, NOW)
    if (pool.some((x) => x.eventType !== "video")) ok(r[0].eventType !== "video", "뉴스가 있는데 영상이 맨 앞")
    for (const x of r) ok(ev.links.some((l) => l.event === x.id && nodeById.get(l.node)!.label.startsWith("DJI")), `DJI 링크 아님: ${x.title}`)
    ok(relatedEventsFor([{ id: "class:Motor", label: "Motor", attributes: {} }], 3, NOW).length === 0, "무관 개체에 이벤트")
    return `${r.length}건: ${r.map((x) => `${x.eventType}@${x.published}`).join(", ")}`
  })

  await t("E8 질의 시점 창 재적용: 기준일로부터 200일 뒤에는 어떤 이벤트도 나오지 않는다", () => {
    const p = planQuery(Q)
    ok(relatedEventsFor(p.entities, 3, new Date(Date.parse(ev.generated) + 200 * DAY)).length === 0, "낡은 이벤트가 노출됨")
  })

  await t("E9 모델 불접촉: 이벤트 제목이 context·시스템 프롬프트·plan에 없다(플래그 on 상태에서도)", async () => {
    process.env.KG_EVENTS = "1"; process.env.KG_FRESHNESS = "1"
    const { buildNimContext, nimSystemPrompt } = await import("../lib/kg-context")
    const p = planQuery(Q)
    const shown = relatedEventsFor(p.entities, 3, new Date(ev.generated + "T12:00:00Z"))
    const ctx = buildNimContext(p)
    const blob = nimSystemPrompt(ctx, "text") + JSON.stringify(p) + JSON.stringify(ctx)
    delete process.env.KG_EVENTS; delete process.env.KG_FRESHNESS
    ok(shown.length > 0, "비교 대상 이벤트 없음")
    for (const x of ev.events) ok(!blob.includes(x.title.slice(0, 40)), `모델 입력에 이벤트 제목 유입: ${x.title}`)
    ok(!blob.includes("relatedEvents") && !blob.includes("event:"), "모델 입력에 이벤트 필드/ID")
    return `표시 대상 ${shown.length}건이 모델 입력에 0건`
  })

  await t("E10 플래그: 기본 off, KG_EVENTS=1일 때만 on", () => {
    delete process.env.KG_EVENTS
    ok(!eventsEnabled(), "기본이 on")
    process.env.KG_EVENTS = "1"; ok(eventsEnabled(), "on 미작동"); delete process.env.KG_EVENTS
  })

  await t("E11 격리: graph.json·knowledge.sql이 이 변경으로 수정되지 않음(git diff 0)", () => {
    const r = spawnSync("git", ["diff", "--quiet", "--", "data/ontology/graph.json", "data/knowledge/knowledge.sql"], { cwd: ROOT })
    ok(r.status === 0, "graph.json 또는 knowledge.sql이 변경됨")
  })

  await t("E12 UI 패널 렌더링: 빈 입력은 아무것도 그리지 않고, 제목의 HTML은 이스케이프되며, 링크는 새 탭·noopener, '미검증' 표기가 있다", async () => {
    const React = (await import("react")).default
    const { renderToStaticMarkup } = await import("react-dom/server")
    const RelatedEvents = (await import("../components/RelatedEvents")).default
    ok(renderToStaticMarkup(React.createElement(RelatedEvents, { events: [] })) === "", "빈 배열에서 렌더됨")
    ok(renderToStaticMarkup(React.createElement(RelatedEvents, {})) === "", "undefined에서 렌더됨")
    const evil = { id: "event:x", title: '<script>alert(1)</script> DJI "firmware"', url: "https://example.com/a?b=1&c=2", source: "example.com", eventType: "news", published: "2026-10-26", about: "제조사" }
    const html = renderToStaticMarkup(React.createElement(RelatedEvents, { events: [evil] }))
    ok(!html.includes("<script>"), "제목의 <script>가 이스케이프되지 않음")
    ok(html.includes("&lt;script&gt;"), "이스케이프 결과 없음")
    ok(html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'), "링크 속성")
    ok(html.includes("미검증") && html.includes("답변 근거 아님"), "미검증 표기 누락")
    ok(html.includes("<details") && !html.includes("<details open"), "기본 접힘이 아님")
  })

  // ── 법령 개정 알림(1단계) ─────────────────────────────────────────────
  const { makeLawSource, lawEventsFrom, termsOf, compact, relatedLawEventsFor, lawEventsEnabled, lawPanelMeta } = await import("../lib/events")

  await t("L1 laws.json 형식: 10건 이내·ID 유일·참조 주제 존재·검색어는 모두 공백 제거 후 3자 이상", () => {
    ok(lawsReal.laws.length > 0 && lawsReal.laws.length <= 10, `법령 ${lawsReal.laws.length}건`)
    ok(lawIds.size === lawsReal.laws.length && [...lawIds].every((x) => x.startsWith("law:")), "ID 중복/형식")
    for (const law of lawsReal.laws) {
      ok(law.name.trim().length > 0, `이름 없음 ${law.id}`)
      for (const tp of law.topics) ok(Array.isArray(lawsReal.topics[tp]), `없는 주제 ${tp} (${law.id})`)
      const raw = [law.name, ...law.aliases, ...law.topics.flatMap((tp) => lawsReal.topics[tp] ?? [])]
      for (const term of raw) ok(compact(term).length >= 3, `검색어가 3자 미만이라 조용히 버려짐: "${term}" (${law.id})`)
      ok(termsOf(law, lawsReal.topics).length === new Set(raw.map(compact)).size, `검색어 손실 ${law.id}`)
    }
    return `법령 ${lawsReal.laws.length}건, confirmed=${lawsReal.confirmed === true}`
  })

  // 합성 피드로 빌더를 돌린다(실제 graph.json·laws.json 사용, 저장소 데이터는 건드리지 않음). 기준일 = 가장 늦은 fetched = 2026-10-30.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "law-ev-"))
  const hex = (c: string) => c.repeat(64)
  const it = (c: string, title: string, published: string, type: string, source = "law.go.kr") =>
    ({ title, url: `https://example.org/${c}`, source, domain: "regulations", type, summary: "", published, fetched: "2026-10-30T08:00:00+09:00", sha256: hex(c) })
  const feed = [
    it("a", "[법령] 항공안전법 · 일부개정 · 시행 2026-04-01", "2026-01-10", "regulation"),
    it("b", "[법령] 항공안전법 시행령 · 일부개정 · 시행 2026-05-01", "2025-12-01", "regulation"),
    it("c", "[법령] 항공안전법 시행규칙 · 일부개정 · 시행 2025-07-01", "2025-06-01", "regulation"), // 365일 밖 → 제외
    it("d", "[법령] 없는법 · 일부개정 · 시행 2026-01-01", "2026-02-01", "regulation"), // 목록에 없음 → 이벤트는 있되 링크 없음
    it("e", "[법령] DJI 항공안전법 · 일부개정 · 시행 2026-04-01", "2026-02-02", "regulation"), // 이름이 정확히 같지 않음 → 법령·제조사 링크 모두 없음
    it("f", "Establishment of Class E Airspace; Havana, IL", "2026-10-22", "regulation", "federalregister.gov"),
    it("g", "DJI Mini 5 review", "2026-06-01", "news", "example.com"), // 151일 전 일반 뉴스 → 90일 창 밖 제외
  ]
  const feedPath = path.join(tmpDir, "feed.json"), outPath = path.join(tmpDir, "events.json")
  fs.writeFileSync(feedPath, JSON.stringify(feed))
  const build = () => spawnSync("python3", ["-I", path.join(ROOT, "scripts", "build-events.py"), "--feed", feedPath, "--out", outPath], { encoding: "utf-8" })
  const synth = (() => { const r = build(); return r.status === 0 ? JSON.parse(fs.readFileSync(outPath, "utf-8")) : { err: r.stderr } })() as {
    err?: string; generated: string; law_window_days: number; events: { id: string; title: string }[]; links: { event: string; node: string; nodeType: string; method: string }[]; stats: Record<string, number>
  }
  const idOf = (c: string) => `event:${hex(c).slice(0, 12)}`

  await t("L2 빌더: 법령명이 정확히 같을 때만 Law 링크, 시행령·시행규칙과 섞이지 않고, 제조사 링크 없음, 기간 창은 법령 365일/일반 90일", () => {
    ok(!synth.err, `빌더 실패: ${synth.err}`)
    const lawLinks = synth.links.filter((l) => l.nodeType === "Law")
    ok(JSON.stringify(lawLinks.map((l) => [l.event, l.node, l.method]).sort()) === JSON.stringify([[idOf("a"), "law:aviation-safety-act", "law-title-exact"], [idOf("b"), "law:aviation-safety-act-decree", "law-title-exact"]].sort()), `법령 링크: ${JSON.stringify(lawLinks)}`)
    const titles = synth.events.map((e) => e.id)
    for (const c of ["a", "b", "d", "e", "f"]) ok(titles.includes(idOf(c)), `이벤트 ${c} 누락`)
    for (const c of ["c", "g"]) ok(!titles.includes(idOf(c)), `창 밖 이벤트 ${c} 포함됨`)
    for (const c of ["d", "e", "f"]) ok(!synth.links.some((l) => l.event === idOf(c)), `링크가 있으면 안 되는 이벤트 ${c}`)
    ok(synth.law_window_days === 365 && synth.stats.lawLinks === 2, `law_window_days=${synth.law_window_days}, lawLinks=${synth.stats.lawLinks}`)
    return "법령 링크 2건(a→법, b→시행령), 오링크 0"
  })

  await t("L2b 결정론: 합성 입력을 두 번 빌드하면 바이트 동일", () => {
    const first = fs.readFileSync(outPath)
    ok(build().status === 0, "재빌드 실패")
    ok(first.equals(fs.readFileSync(outPath)), "두 번 빌드 결과가 다름")
  })

  await t("L3 질의: 법령명·주제어·공백 변형에 반응하고, 무관한 질문·미확정 목록·기간 초과에는 0건", () => {
    const NOW = new Date(synth.generated + "T12:00:00Z")
    const src = makeLawSource({ ...lawsReal, confirmed: true }, synth as never)
    const byName = lawEventsFrom(src, "항공안전법 개정 알려줘", 3, NOW)
    ok(byName.length === 1 && byName[0].id === idOf("a") && byName[0].kind === "law" && byName[0].about === "항공안전법", `법령명: ${JSON.stringify(byName.map((x) => x.id))}`)
    const topic = lawEventsFrom(src, "초경량 비행장치 신고 방법", 3, NOW)
    ok(JSON.stringify(topic.map((x) => x.id)) === JSON.stringify([idOf("a"), idOf("b")]), `주제어(최신순 a,b): ${JSON.stringify(topic.map((x) => x.id))}`)
    ok(JSON.stringify(lawEventsFrom(src, "초경량비행장치 신고", 3, NOW).map((x) => x.id)) === JSON.stringify(topic.map((x) => x.id)), "공백 변형 결과가 다름")
    ok(lawEventsFrom(src, "DJI Mini 5 사양 알려줘", 3, NOW).length === 0, "무관한 질문에 법령 이벤트")
    ok(lawEventsFrom(src, "초경량 비행장치 신고 방법", 1, NOW).length === 1, "max 미적용")
    ok(lawEventsFrom(makeLawSource({ ...lawsReal, confirmed: false }, synth as never), "항공안전법 개정", 3, NOW).length === 0, "미확정 목록인데 노출")
    ok(lawEventsFrom(src, "항공안전법 개정", 3, new Date(NOW.getTime() + 400 * DAY)).length === 0, "기간 초과 이벤트 노출")
    return `법령명 1건, 주제어 2건(최신순)`
  })

  await t("L4 실제 목록 게이트: laws.json 이 확정되기 전에는 번들된 데이터로 어떤 질문에도 0건, 플래그 기본 off", () => {
    delete process.env.KG_LAW_EVENTS
    ok(!lawEventsEnabled(), "기본이 on")
    process.env.KG_LAW_EVENTS = "1"; ok(lawEventsEnabled(), "on 미작동"); delete process.env.KG_LAW_EVENTS
    if (lawsReal.confirmed !== true) ok(relatedLawEventsFor("항공안전법 초경량 비행장치 비행승인").length === 0, "미확정인데 노출")
    return lawsReal.confirmed === true ? "목록 확정됨 — 게이트 시험은 L3 가 담당" : "미확정 게이트 확인"
  })

  await t("L5 모델 불접촉(정적): lib 안에서 events.ts 외에는 events·laws 를 import 하지 않는다 + route 는 메타데이터에만 싣는다", () => {
    const libDir = path.join(ROOT, "lib")
    for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith(".ts") && x !== "events.ts")) {
      const src = fs.readFileSync(path.join(libDir, f), "utf-8")
      ok(!/from\s+["'](?:@\/lib|\.)\/events["']/.test(src) && !/laws\.json/.test(src), `lib/${f} 가 events/laws 를 가져옴 — 모델 입력 유입 위험`)
    }
    const route = fs.readFileSync(path.join(ROOT, "app", "api", "chat", "route.ts"), "utf-8")
    ok(!/relatedLawEventsFor\(|lawEventsEnabled\(/.test(route), "route.ts 가 법령 조회 함수를 직접 부름 — lawPanelMeta 한 곳을 거쳐야 함")
    const uses = route.split("\n").filter((l) => l.includes("lawPanelMeta("))
    ok(uses.length === 3, `route.ts 의 lawPanelMeta 호출 ${uses.length}곳(스트리밍 1 + 근거 부족 즉시 응답 1 + verbatim 즉답 1 이어야 함)`)
    ok(uses.some((l) => l.includes("instantReply(vb.text")), "verbatim 즉답 경로: 즉시 응답 메타 인자로 쓰이지 않음(비행승인·금지구역 같은 법령 질문 대부분이 이 경로)")
    ok(uses.some((l) => l.includes("const events =")), "스트리밍 경로: 법령 이벤트가 events 메타 변수 밖에서 쓰임")
    ok(uses.some((l) => l.includes("instantReply(insufficientMessage(plan)")), "근거 부족 경로: 즉시 응답 메타 인자로 쓰이지 않음")
    ok(!uses.some((l) => /streamText|system:|nimSystemPrompt|buildNimContext/.test(l)), "법령 이벤트가 모델 호출 인자와 같은 줄에서 쓰임")
  })

  await t("L7 법령 패널 메타(스트리밍·근거 부족 공통 조각): 플래그 off 면 빈 객체, on 이면 법령 질문에만 relatedEvents(kind=law), 무관 질문은 빈 객체", () => {
    const NOW = new Date(ev.generated + "T12:00:00Z")
    const hasLawEvents = ev.links.some((l) => l.nodeType === "Law")
    const qs = ["초경량비행장치 비행승인", "항공안전법 개정 내용 알려줘"] // 운영 검증에서 근거 부족 즉시 응답으로 나온 질문 유형 포함
    delete process.env.KG_LAW_EVENTS
    for (const q of qs) ok(Object.keys(lawPanelMeta(q, NOW)).length === 0, `플래그 off 인데 메타가 나옴: ${q}`)
    process.env.KG_LAW_EVENTS = "1"
    try {
      ok(Object.keys(lawPanelMeta("DJI Mini 5 사양 알려줘", NOW)).length === 0, "무관한 질문에 법령 메타")
      ok(Object.keys(lawPanelMeta("", NOW)).length === 0, "빈 질문에 법령 메타")
      if (lawsReal.confirmed === true && hasLawEvents) {
        for (const q of qs) {
          const r = lawPanelMeta(q, NOW).relatedEvents
          ok(r && r.length > 0 && r.length <= 3 && r.every((x) => x.kind === "law" && x.eventType === "regulation"), `법령 질문인데 패널 메타 없음/형식 이상: ${q}`)
        }
      }
    } finally { delete process.env.KG_LAW_EVENTS }
    return hasLawEvents ? "법령 이벤트가 있는 번들 데이터로 확인" : "번들 데이터에 법령 이벤트 없음 — 노출 시험은 건너뜀(게이트·무관 질문만 확인)"
  })

  await t("L6 UI 패널: 법령 항목은 '⚖ 법령' 표시와 법적 자문 아님 고지가 있고, 법령이 없으면 고지가 없다", async () => {
    const React = (await import("react")).default
    const { renderToStaticMarkup } = await import("react-dom/server")
    const RelatedEvents = (await import("../components/RelatedEvents")).default
    const base = { id: "event:x", title: "[법령] 항공안전법 · 일부개정 · 시행 2026-04-01", url: "https://example.com/a", source: "law.go.kr", eventType: "regulation", published: "2026-01-10" }
    const lawHtml = renderToStaticMarkup(React.createElement(RelatedEvents, { events: [{ ...base, about: "항공안전법", kind: "law" as const }] }))
    ok(lawHtml.includes("⚖ 법령") && lawHtml.includes("법적 자문이 아닙니다") && lawHtml.includes("미검증"), "법령 표시/고지/미검증 누락")
    ok(!lawHtml.includes("[법령]") && lawHtml.includes("항공안전법 · 일부개정 · 시행 2026-04-01"), "법령 제목의 [법령] 접두어가 화면에 그대로 노출됨(중복 표기)")
    const plainHtml = renderToStaticMarkup(React.createElement(RelatedEvents, { events: [{ ...base, eventType: "news", about: "DJI" }] }))
    ok(!plainHtml.includes("법적 자문"), "법령이 아닌데 고지가 붙음")
  })
  fs.rmSync(tmpDir, { recursive: true, force: true })

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
