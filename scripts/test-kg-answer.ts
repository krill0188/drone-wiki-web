// 온톨로지 우선 답변 시나리오 시험 (11개 + 보조). 실행: npx tsx scripts/test-kg-answer.ts [--live]
// NIM 응답은 기본적으로 결정론적 대역(stub)으로 주입한다. --live 이면 실제 NVIDIA NIM으로 2건을 추가 호출한다.
import { all } from "../lib/kdb"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const LIVE = process.argv.includes("--live")
if (LIVE) { // .env.local 에서 NIM 키만 읽는다(값은 출력하지 않는다)
  try {
    for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
      const m = /^NVIDIA_NIM_API_KEY=(.*)$/.exec(line)
      if (m) process.env.NVIDIA_NIM_API_KEY = m[1].replace(/^["']|["']$/g, "")
    }
  } catch { /* 키 없으면 live 건은 NOT RUN */ }
}

type Result = { name: string; status: "PASS" | "FAIL" | "NOT RUN" | "UNKNOWN"; note?: string }
const results: Result[] = []
const t = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try { const note = await fn(); results.push({ name, status: "PASS", note: note || undefined }) }
  catch (e) { results.push({ name, status: "FAIL", note: e instanceof Error ? e.message : String(e) }) }
}
const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }

async function main() {
  const { planQuery } = await import("../lib/kg-plan")
  const { answerQuestion } = await import("../lib/kg-answer")
  const { verifyAnswer } = await import("../lib/kg-verify")
  const { buildNimContext, nimSystemPrompt } = await import("../lib/kg-context")
  const { kdbInfo, all } = await import("../lib/kdb")

  const info = kdbInfo()
  ok(info.ok, "지식 DB 적재 실패")
  const never = async () => { throw new Error("NIM이 호출되면 안 되는 시나리오") }
  // 대역: context의 첫 claim/relation ID를 정확히 인용하는 정상 답변
  const goodStub = (extra = "") => async (system: string) => {
    const ctx = JSON.parse(system.slice(system.indexOf("<context>\n") + 10, system.indexOf("\n</context>")))
    const c = ctx.verified_claims.find((x: { origin: string }) => x.origin !== "wiki") ?? ctx.verified_claims[0]
    const r = ctx.ontology_relations.find((x: { predicate: string }) => x.predicate === "powersWith") ?? ctx.ontology_relations[0]
    return JSON.stringify({ answer: `근거: ${c ? `[${c.ref}] ${c.value}` : ""} ${r ? `[${r.ref}]` : ""} ${extra}`.trim(), used_claims: c ? [c.ref] : [], used_relations: r ? [r.ref] : [] })
  }

  await t("S0 SQLite가 실제로 호출됨(적재·지문)", () => `fingerprint=${(info as { fingerprint: string }).fingerprint} load=${(info as { loadMs: number }).loadMs}ms`)

  await t("S1 domain 식별은 우선순위 가산만(필터 아님): 첫 문서가 식별 domain", () => {
    const p = planQuery("하드웨어 배터리 에너지 밀도 근거")
    ok(p.domainFilter.includes("hardware") && p.domainSource === "keyword", `domain=${p.domainFilter}/${p.domainSource}`)
    ok(p.status === "ready", p.status)
    ok(p.pages[0]?.domain === "hardware", `첫 문서 domain=${p.pages[0]?.domain}`)
    return `domain=${p.domainFilter} 문서=${p.pages.length}`
  })

  await t("S1b 명시 domain 지정이 키워드 식별보다 우선", () => {
    const p = planQuery("배터리 에너지 밀도 근거", { domains: ["electrical-power"] })
    ok(p.domainSource === "explicit" && p.domainFilter.join() === "electrical-power", `${p.domainSource}:${p.domainFilter}`)
    ok(p.pages.every((x) => x.domain === "electrical-power"), `명시 domain은 하드 필터: ${p.pages.map((x) => x.domain)}`)
  })

  await t("S2 ontology class 명시 질의: ontology가 위키보다 먼저", () => {
    const p = planQuery("모터에 맞는 ESC")
    ok(p.classes.includes("ESC") && p.classes.includes("Motor"), `classes=${p.classes}`)
    const first = p.claims[0]
    ok(!first || first.origin !== "wiki", "위키 claim이 온톨로지 claim보다 앞섬")
  })

  await t("S3 개체 간 관계 질의: powersWith 관계가 답변에 반영·검증됨", async () => {
    const a = await answerQuestion("T-MOTOR MN5008 모터에 맞는 ESC 알려줘", { generate: goodStub() })
    ok(a.status === "answered", `status=${a.status} ${JSON.stringify(a.verification.violations)}`)
    ok(a.ontology.relations.some((r) => r.predicate === "powersWith"), "powersWith 관계 없음")
    ok(/\[R\d+\]/.test(a.answer), "관계 핸들 인용 없음")
    return `관계 ${a.ontology.relations.length}건`
  })

  await t("S4 논문 claim 질의: verified + 원문 인용 + 출처 URL 반환", async () => {
    const a = await answerQuestion("AeroEval 논문의 배터리 패키징 계수를 알려줘", { generate: goodStub() })
    ok(a.status === "answered", a.status)
    const c = a.claims.find((x) => x.evidence_kind === "model-assumption")
    ok(c, "모델 가정 claim 없음")
    const e = a.evidence.find((x) => x.claim_id === c!.id)
    ok(e && e.verified && e.quote.length > 15 && /arxiv\.org/.test(e.source_url), `evidence=${JSON.stringify(e)}`)
    ok(a.confidence !== "high", "모델 가정값인데 high")
    return `quote="${e!.quote.slice(0, 40)}…" ${e!.source_url}`
  })

  await t("S5 출처 없는(해석 실패) claim은 사용 금지·개수 공개", () => {
    const row = all<{ object_value: string }>("SELECT object_value FROM claims WHERE origin='wiki' AND status='blocked' LIMIT 1")[0]
    ok(row, "blocked claim 없음")
    const p = planQuery(row.object_value)
    ok(!p.claims.some((c) => c.status === "blocked"), "blocked claim이 사용됨")
    ok(p.excluded.blocked >= 1 || p.status === "insufficient_evidence", "제외 사실이 공개되지 않음")
    return `제외 blocked=${p.excluded.blocked} status=${p.status}`
  })

  await t("S6 contested claim: confidence low + 충돌 미언급 답변은 위반", async () => {
    const row = all<{ object_value: string }>("SELECT object_value FROM claims WHERE status='contested' LIMIT 1")[0]
    ok(row, "contested claim 없음")
    const p = planQuery(row.object_value)
    ok(p.contested, "contested 플래그 없음")
    ok(p.confidence === "low" || p.status === "insufficient_evidence", `confidence=${p.confidence}`)
    const ctx = buildNimContext({ ...p, status: "ready" })
    const bad = verifyAnswer("문제 없는 확정 사실입니다.", ctx)
    ok(!bad.ok && bad.violations.some((v) => v.code === "contested_not_flagged"), "충돌 미언급이 통과됨")
    const good = verifyAnswer("서로 다른 값이 충돌하는 claim입니다.", ctx)
    ok(!good.violations.some((v) => v.code === "contested_not_flagged"), "충돌 언급인데 위반 처리됨")
  })

  await t("S7 discovery 그래프에만 있는 정보는 답변 근거가 될 수 없음", async () => {
    const dp = path.join(os.homedir(), "2nd", ".ua", "discovery-knowledge-graph.json")
    if (!fs.existsSync(dp)) { results.push({ name: "S7(skip)", status: "NOT RUN", note: "discovery 파일 없음" }); return }
    const g = JSON.parse(fs.readFileSync(dp, "utf-8")) as { nodes: { label?: string; name?: string; id?: string }[] }
    // 위키 본문·제목·claim·별칭 어디에도 전혀 나오지 않는 discovery 노드명을 찾는다(위키가 실제로 다루는 주제는 위키 요약 기반 답변이 정당하므로 제외)
    let picked = ""
    for (const n of g.nodes) {
      const label = String(n.label ?? n.name ?? n.id ?? "")
      if (label.length < 6 || !/^[A-Za-z][A-Za-z0-9]+$/.test(label)) continue
      const tokq = `"${label.toLowerCase()}"`
      const inDocs = all<{ n: number }>("SELECT count(*) n FROM document_fts WHERE document_fts MATCH ?", tokq)[0].n
      const inClaims = all<{ n: number }>("SELECT count(*) n FROM claim_fts WHERE claim_fts MATCH ?", tokq)[0].n
      const inAlias = all<{ n: number }>("SELECT count(*) n FROM ontology_aliases WHERE alias = ?", label.toLowerCase())[0].n
      if (inDocs + inClaims + inAlias === 0) { picked = label; break }
    }
    ok(picked, "DB에 없는 discovery 노드를 찾지 못함")
    const a = await answerQuestion(`${picked} 설명해줘`, { generate: never })
    ok(a.status === "insufficient_evidence" && !a.nim_called, `status=${a.status} nim=${a.nim_called}`)
    return `discovery 노드 "${picked}" → ${a.status}`
  })

  await t("S8 존재하지 않는 정보: NIM 미호출 + insufficient_evidence", async () => {
    for (const q of ["김치찌개 레시피", "양자 컴퓨터로 비행제어를 하는 방법", "드론 군집 비행의 역사 알려줘"]) {
      const a = await answerQuestion(q, { generate: never })
      ok(a.status === "insufficient_evidence" && !a.nim_called && a.claims.length === 0, `${q} → ${a.status}`)
    }
  })

  await t("S8b 위키에만 근거가 있는 질문: 위키 요약 기반으로 답하되 신뢰도 high 금지·표기 필수", async () => {
    // PX4 클래스에 사람이 승인해 연결한 문서가 생겼으므로(2026-10-20) 이 질문은 ontology-linked. 위키 단독(wiki-sourced) 경로는 W1(MAVLink)이 검증한다.
    const p = planQuery("PX4 오프보드 제어 모드")
    ok(p.status === "ready" && p.basis === "ontology-linked", `status=${p.status} basis=${p.basis}`)
    ok(p.confidence !== "high", "위키 단독 근거인데 high")
    ok(p.limitations.some((l) => l.includes("위키 요약") || l.includes("승인해 연결한 위키 문서")), "위키 요약 기반 한계가 표기되지 않음")
    const ctx = buildNimContext(p)
    ok(ctx.basis === "ontology-linked", "context에 basis가 전달되지 않음")
  })

  await t("L1 클래스 연결 문서: PX4·ArduPilot·ROS2·FlightStack 질문은 ontology-linked, 연결 문서가 먼저", () => {
    for (const q of ["PX4가 뭐야", "ArduPilot 설명해줘", "FlightStack이 뭐야?"]) {
      const p = planQuery(q)
      ok(p.status === "ready" && p.basis === "ontology-linked", `${q} → ${p.status}/${p.basis}`)
      ok(p.confidence !== "high", `${q} 신뢰도 high`)
      ok(p.pages.some((x) => x.ontologyClass), `${q} 연결 문서 없음`)
    }
  })

  await t("L2 연결 문서가 있어도 요구한 내용이 없으면 거절(군집 비행의 역사)", () => {
    const p = planQuery("드론 군집 비행의 역사 알려줘")
    ok(p.status === "insufficient_evidence", `${p.status}/${p.basis}`)
  })

  await t("K1 한국 드론 법령 질문: 법령 페이지를 근거로 답변 가능, 공학 규칙으로 둔갑하지 않음", () => {
    const cases: [string, string][] = [
      ["250g 이하 드론도 조종자 증명이 필요해?", "kr-ultralight-registration-certification"],
      ["기체 신고 면제 기준은?", "kr-ultralight-registration-certification"],
      ["비행승인 고도 기준은?", "kr-drone-flight-approval-airspace"],
      ["한국 드론 과태료 얼마야?", "kr-drone-penalties"],
      ["한국에서 드론 비행 허가 절차는?", "kr-drone-flight-approval-airspace"],
    ]
    for (const [q, doc] of cases) {
      const p = planQuery(q)
      ok(p.status === "ready" && p.basis === "wiki-sourced" && p.confidence !== "high", `${q} → ${p.status}/${p.basis}/${p.confidence}`)
      ok(p.pages.some((x) => x.path.includes(doc)), `${q}: ${doc} 없음 (${p.pages.map((x) => x.path)})`)
      ok(!p.claims.some((c) => c.origin !== "wiki"), `${q}: 공학 claim이 섞임`)
    }
  })

  await t("K3 법령 질문은 모델 없이 위키 문장을 그대로 인용(NIM 미호출), 인용 문장이 문서에 그대로 존재", async () => {
    for (const q of ["250g 이하 드론도 조종자 증명이 필요해?", "기체 신고 면제 기준은?", "비행승인 고도 기준은?", "한국 드론 과태료 얼마야?"]) {
      const a = await answerQuestion(q, { generate: never })
      ok(a.status === "answered" && !a.nim_called, `${q} → ${a.status} nim=${a.nim_called}`)
      const bullets = a.answer.split("**출처 문서**")[0].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- /, "").replace(/\s*\[P\d+\]$/, ""))
      ok(bullets.length > 0, `${q}: 인용 문장 없음`)
      const bodies = a.canonical_pages.map((p) => all<{ body: string }>("SELECT body FROM documents WHERE path = ?", p.path)[0]?.body ?? "").join("\n").replace(/\s*\^\[[^\]]*\]/g, "")
      for (const b of bullets) ok(bodies.includes(b), `${q}: 문서에 없는 문장 "${b.slice(0, 40)}"`)
    }
    const a1 = await answerQuestion("250g 이하 드론도 조종자 증명이 필요해?", { generate: never })
    ok(/250g 이하는 증명 대상에서 제외/.test(a1.answer), "250g 증명 제외 문장 누락")
  })

  await t("K2 법령 별표처럼 수집본에 없는 내용(P-73 경계)은 지어내지 않고 거절", () => {
    const p = planQuery("P-73 비행금지구역 경계가 어디야?")
    ok(p.status === "insufficient_evidence", `${p.status}/${p.basis}`)
  })

  await t("W1 MAVLink란 무엇인가요: 프로토콜 클래스(CommunicationProtocol, 2026-10-21 신설)에 연결된 문서로 ontology-linked 답변", () => {
    const p = planQuery("MAVLink 프로토콜이란 무엇인가요?")
    ok(p.status === "ready" && p.basis === "ontology-linked" && p.confidence !== "high" && p.classes.includes("CommunicationProtocol"), `${p.status}/${p.basis}/${p.confidence}/${p.classes}`)
    ok(p.pages.some((x) => /mavlink/.test(x.path)), `문서=${p.pages.map((x) => x.path)}`)
  })

  await t("W1b DJI는 어떤 회사야: '회사야'는 일반어라 거절 사유가 아님 + 합성어 수소연료전지는 구성어(연료전지)로 인정", () => {
    const a = planQuery("DJI는 어떤 회사야?")
    ok(a.status === "ready", `DJI ${a.status}/${a.basis}`)
    const b = planQuery("수소연료전지 드론 동력원은?")
    ok(b.status === "ready" && b.classes.includes("Engine"), `연료전지 ${b.status}/${b.basis}/${b.classes}`)
    const c = planQuery("양자컴퓨터 드론 항법은?")
    ok(c.status === "insufficient_evidence", `양자 ${c.status}`)
  })

  await t("W1c 문체 부사(자세히·간단히·쉽게)는 핵심 개념이 아니다: 'RTK와 PPK의 차이를 자세히 설명해줘'가 거절되면 안 됨", () => {
    for (const q of ["RTK와 PPK의 차이를 자세히 설명해줘", "MAVLink를 쉽게 알려줘", "PX4를 간단히 요약해줘", "ArduPilot 설치 방법을 단계별로 알려줘", "GNSS 재밍 대응 방법을 정리해줘", "LiPo 배터리 보관 방법은 뭐예요", "RTK 안테나 설치 위치 주의점은?", "GNSS 재밍 대응 시 핵심 포인트는?"]) {
      const r = planQuery(q)
      ok(r.status === "ready", `${q} → ${r.status}/${r.basis}`)
    }
  })

  await t("W1d '미확인' 표기는 사용자·모델에게 '재확인 필요'로 통일되고, 근거 부족 시 추론(확률 등급) 규칙이 프롬프트에 있다", async () => {
    const { soften } = await import("../lib/soften")
    ok(soften("값은 미확인입니다") === "값은 재확인이 필요합니다", soften("값은 미확인입니다"))
    ok(!soften("Hot start 미확인, 크기 미확인이며").includes("미확인"), "잔여 미확인")
    // 스트림: 청크 경계에서 쪼개진 '미확인'도 바뀐다
    const { softenTransform } = await import("../lib/soften")
    const chunks = ["값은 ", "미", "확", "인입", "니다. 크기 미확인", "이며 끝"]
    const rs = new ReadableStream({ start(c) { for (const x of chunks) c.enqueue({ type: "text-delta", id: "a", text: x }); c.enqueue({ type: "text-end", id: "a" }); c.close() } }).pipeThrough(softenTransform())
    let out = ""
    for await (const p of rs as unknown as AsyncIterable<{ type: string; text?: string }>) if (p.type === "text-delta") out += p.text
    ok(!out.includes("미확인") && out.includes("재확인이 필요합니다") && out.includes("재확인이 필요하며"), `스트림 변환 결과: ${out}`)
    const q = planQuery("u-blox ZED-X20P 사양은?")
    const ctx = buildNimContext(q)
    const sys = nimSystemPrompt(ctx, "text")
    ok(sys.includes("🔮 추론(확률 등급)") && sys.includes("재확인 필요"), "추론·재확인 규칙 누락")
    const body = sys.slice(sys.indexOf("<context>"), sys.indexOf("</context>"))
    ok(!body.includes("미확인"), "context에 미확인이 남음")
  })

  await t("S13 문서의 RTCM34를 답변이 'RTCM 3.4'로 풀어 써도 숫자 환각으로 보지 않는다(운영 NGII 질문 오탐)", () => {
    const q = planQuery("국토지리정보원 네트워크 RTK 접속 서버 주소는?")
    const ctx = buildNimContext(q)
    const r = verifyAnswer("RTS1은 VRS 전용(RTCM 2.3/3.1/3.2/3.4 마운트포인트) [P1]", ctx, 1)
    ok(!r.violations.some((v) => v.code === "unsupported_number" && ["3.4", "3.2", "3.1", "2.3"].includes(v.detail)), JSON.stringify(r.violations))
  })

  await t("S14 추론(🔮) 문단에 근거 밖 숫자가 있으면 서버가 그 문단만 생략하고, 숫자가 근거 안이면 그대로 둔다", async () => {
    const { inferenceGuard } = await import("../lib/soften")
    const run = async (chunks: string[], bad: (t: string) => boolean) => {
      const rs = new ReadableStream({ start(c) { for (const x of chunks) c.enqueue({ type: "text-delta", id: "a", text: x }); c.enqueue({ type: "text-end", id: "a" }); c.close() } }).pipeThrough(inferenceGuard(bad))
      let out = ""
      for await (const p of rs as unknown as AsyncIterable<{ type: string; text?: string }>) if (p.type === "text-delta") out += p.text
      return out
    }
    const bad = (t: string) => /3\.85/.test(t)
    const a = await run(["결론입니다. [P1]\n\n---\n\n## ", "🔮 추론(가능성 낮음)", "\n- 보관 전압 3.", "85 V/셀"], bad)
    ok(a.includes("결론입니다. [P1]") && !a.includes("3.85") && a.includes("추론 생략") && !a.includes("---\n\n## \n"), `생략 결과: ${JSON.stringify(a)}`)
    const b = await run(["결론. [P1]\n\n## 🔮 추론(가능성 중간)\n- 지연이 늘 수 있음 [P2]"], bad)
    ok(b.includes("지연이 늘 수 있음") && !b.includes("추론 생략"), `정상 결과: ${JSON.stringify(b)}`)
    const c = await run(["본문만 있는 답변입니다."], bad)
    ok(c === "본문만 있는 답변입니다.", `추론 없음: ${JSON.stringify(c)}`)
  })

  await t("W2 PX4 vs ArduPilot: 두 대상의 문서를 각각 가져오고, 단어만 겹친 논문 측정값은 근거에서 제외", () => {
    const p = planQuery("PX4와 ArduPilot의 차이점은?")
    ok(p.classes.includes("PX4") && p.classes.includes("ArduPilot"), `classes=${p.classes}`)
    ok(p.pages.some((x) => /px4/.test(x.path)) && p.pages.some((x) => /ardupilot/.test(x.path)), `문서=${p.pages.map((x) => x.path)}`)
    ok(!p.claims.some((c) => c.id === "P2601.15486-01"), "지연 시간 측정 claim이 '차이점'의 근거로 쓰임(오답 사례)")
  })

  await t("W2b ROS2 연동: domain을 필터로 쓰지 않아 ros2 문서(gcs-software)를 찾음", () => {
    const p = planQuery("ROS2와 드론 연동 방법")
    ok(p.status === "ready" && p.pages.some((x) => /ros2/.test(x.path)), `${p.status} 문서=${p.pages.map((x) => x.path)}`)
  })

  await t("W3 비행 컨트롤러 선택 기준: flight-controller 문서가 맨 앞", () => {
    const p = planQuery("드론 비행 컨트롤러 선택 기준")
    ok(p.pages[0]?.path.includes("flight-controller"), `첫 문서=${p.pages[0]?.path}`)
  })

  await t("W4 위키가 다루지 않는 핵심 개념(양자)은 거절하고 이유를 공개", async () => {
    const a = await answerQuestion("양자 컴퓨터로 비행제어를 하는 방법", { generate: never })
    ok(a.status === "insufficient_evidence" && !a.nim_called, a.status)
    ok(/양자/.test(a.answer), "거절 사유에 누락 개념이 없음")
  })

  await t("W5 근거 표기가 하나도 없는 답변은 위반(missing_citation)", () => {
    const p = planQuery("MAVLink 프로토콜이란 무엇인가요?")
    const ctx = buildNimContext(p)
    ok(verifyAnswer("MAVLink는 통신 프로토콜입니다.", ctx).violations.some((v) => v.code === "missing_citation"), "인용 없는 답변이 통과됨")
    const h = ctx.ids.pages[0]
    ok(!verifyAnswer(`MAVLink는 통신 프로토콜입니다 [${h}].`, ctx).violations.some((v) => v.code === "missing_citation"), "인용 있는 답변이 위반 처리됨")
  })

  await t("S9 임베딩 실패와 무관: kg-plan은 임베딩·RAG 모듈을 쓰지 않음", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "kg-plan.ts"), "utf-8")
    ok(!/from\s+["']\.\/rag["']|from\s+["']\.\/graphrag["']|embeddings\.json/.test(src), "RAG/임베딩 의존이 있음")
    const prev = process.env.WIKI_PATH
    process.env.WIKI_PATH = "/nonexistent-embedding-path"
    const p = planQuery("T-MOTOR MN5008 모터에 맞는 ESC")
    process.env.WIKI_PATH = prev
    ok(p.status === "ready", "임베딩 경로가 없을 때 계획 실패")
  })

  await t("S10 keyword fallback: 개체·규칙 없이 FTS만으로도 비위키 claim이 먼저", () => {
    const p = planQuery("AeroEval packaging multiplier")
    ok(p.entities.length === 0, "개체 없는 질의가 아님")
    ok(p.claims.length > 0 && p.claims[0].origin !== "wiki", "FTS 폴백이 비위키 claim을 먼저 내지 않음")
  })

  await t("S11 NIM이 evidence 밖 내용을 생성: 차단(strict)·경고(non-strict)·재작성 성공", async () => {
    const fabricated = async () => JSON.stringify({ answer: "팩 에너지밀도는 999 Wh/kg 입니다 [C999]", used_claims: [] })
    const strict = await answerQuestion("배터리 에너지 밀도 근거", { generate: fabricated })
    ok(strict.status === "unverified" && strict.blocked && strict.verification.retried, `strict: ${strict.status} blocked=${strict.blocked}`)
    ok(strict.verification.violations.some((v) => v.code === "unsupported_number") && strict.verification.violations.some((v) => v.code === "unknown_id"), "위반 종류 누락")
    ok(!/999/.test(strict.answer), "차단 응답에 조작된 수치가 남음")
    const soft = await answerQuestion("배터리 에너지 밀도 근거", { generate: fabricated, strict: false })
    ok(soft.status === "unverified" && !soft.blocked && soft.confidence === "low", `non-strict: ${soft.status} blocked=${soft.blocked} conf=${soft.confidence}`)
    let n = 0
    const fixesOnRetry = async (system: string) => (++n === 1 ? fabricated() : goodStub()(system))
    const fixed = await answerQuestion("배터리 에너지 밀도 근거", { generate: fixesOnRetry })
    ok(fixed.status === "answered" && fixed.verification.retried, `재작성: ${fixed.status}`)
  })

  await t("S12 domain 값 보존: 질의 결과의 문서 domain이 DB 원값 그대로", () => {
    const p = planQuery("하드웨어 배터리 에너지 밀도 근거")
    for (const pg of p.pages) {
      const row = all<{ domain: string | null }>("SELECT domain FROM documents WHERE path = ?", pg.path)[0]
      ok(row && row.domain === pg.domain, `${pg.path} domain 불일치`)
    }
  })

  if (LIVE) {
    if (!process.env.NVIDIA_NIM_API_KEY) results.push({ name: "L1/L2 실제 NIM 호출", status: "NOT RUN", note: "NIM 키 없음" })
    else {
      for (const q of ["T-MOTOR MN5008 모터에 맞는 ESC 알려줘", "AeroEval 논문의 배터리 패키징 계수를 알려줘"]) {
        await t(`L 실제 NIM: ${q.slice(0, 22)}`, async () => {
          const t0 = Date.now()
          const a = await answerQuestion(q)
          ok(a.nim_called, "NIM이 호출되지 않음")
          return `status=${a.status} conf=${a.confidence} retried=${a.verification.retried} violations=${a.verification.violations.map((v) => v.code).join("|") || "-"} ${Date.now() - t0}ms`
        })
      }
    }
  } else results.push({ name: "L 실제 NIM 호출(JSON 계약 준수)", status: "NOT RUN", note: "--live 필요" })

  console.log("\n결과")
  for (const r of results) console.log(`  ${r.status.padEnd(7)} ${r.name}${r.note ? "  — " + r.note : ""}`)
  const fail = results.filter((r) => r.status === "FAIL").length
  console.log(`\nPASS ${results.filter((r) => r.status === "PASS").length} · FAIL ${fail} · NOT RUN ${results.filter((r) => r.status === "NOT RUN").length}`)
  process.exit(fail ? 1 : 0)
}
main()
