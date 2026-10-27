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

  await t("E2 90일 창: 모든 이벤트가 생성 기준일로부터 90일 이내이고 미래가 아님", () => {
    const g = Date.parse(ev.generated)
    for (const e of ev.events) {
      const p = Date.parse(e.published)
      ok(Number.isFinite(p) && p <= g && g - p <= ev.window_days * DAY, `${e.id} published=${e.published} generated=${ev.generated}`)
    }
  })

  await t("E3 링크 무결성: 이벤트·노드가 실제로 존재하고, 노드 유형이 링크 유형과 일치", () => {
    for (const l of ev.links) {
      ok(evById.has(l.event), `없는 이벤트 ${l.event}`)
      const n = nodeById.get(l.node)
      ok(n && n.type === l.nodeType && l.predicate === "mentions", `링크 노드 ${l.node}`)
    }
    return `링크 ${ev.links.length}건`
  })

  await t("E4 링크 정밀도(전수): 모든 링크의 제조사 이름이 이벤트 제목에 실제로 들어 있다", () => {
    const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `
    for (const l of ev.links) {
      const e = evById.get(l.event)!, n = nodeById.get(l.node)!
      const base = n.label.replace(/\(.*?\)/g, " ")
      const names = [base, ...(n.label.match(/\((.*?)\)/g) ?? []).map((x) => x.slice(1, -1)), ...base.split(/[/,]/)].map((x) => norm(x).trim()).filter((x) => x.length >= 3)
      ok(names.some((x) => norm(e.title).includes(` ${x} `)), `제목에 제조사명 없음: [${n.label}] ${e.title}`)
    }
  })

  await t("E5 골든(수동 검토 확정): 반드시 링크 / 절대 링크 금지", () => {
    const labelsOf = (re: RegExp) => ev.events.filter((e) => re.test(e.title)).map((e) => ({ e, linked: ev.links.filter((l) => l.event === e.id).map((l) => nodeById.get(l.node)!.label) }))
    const must: [RegExp, string][] = [[/DJI updates Mini 5 Pro/, "DJI"], [/Skydio unveils the F10/, "Skydio"], [/Parrot Strengthens/, "Parrot"], [/\[Auterion\] Auterion in Ukraine/, "Auterion"]]
    for (const [re, label] of must) {
      const rows = labelsOf(re)
      ok(rows.length > 0, `골든 이벤트가 데이터에 없음(피드가 바뀜?): ${re}`)
      for (const r of rows) ok(r.linked.includes(label), `${label} 링크 누락: ${r.e.title}`)
    }
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

  const w = Math.max(...results.map((r) => r.name.length))
  for (const r of results) console.log(`${r.status}  ${r.name.padEnd(w)}${r.note ? `  — ${r.note}` : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\n${results.length - fail}/${results.length} PASS${fail ? `, ${fail} FAIL` : ""}`)
  process.exit(fail ? 1 : 0)
}
main()
