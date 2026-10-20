// 온톨로지 우선 답변 시나리오 시험 (11개 + 보조). 실행: npx tsx scripts/test-kg-answer.ts [--live]
// NIM 응답은 기본적으로 결정론적 대역(stub)으로 주입한다. --live 이면 실제 NVIDIA NIM으로 2건을 추가 호출한다.
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
  const { buildNimContext } = await import("../lib/kg-context")
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

  await t("S1 domain 기반 일반 질의: domain 식별 + wiki 문서에만 필터", () => {
    const p = planQuery("하드웨어 배터리 에너지 밀도 근거")
    ok(p.domainFilter.includes("hardware"), `domain=${p.domainFilter}`)
    ok(p.status === "ready", p.status)
    ok(p.pages.every((x) => x.domain === "hardware"), "문서가 domain 필터를 지키지 않음")
    return `domain=${p.domainFilter} 문서=${p.pages.length}`
  })

  await t("S1b 명시 domain 지정이 키워드 식별보다 우선", () => {
    const p = planQuery("배터리 에너지 밀도 근거", { domains: ["electrical-power"] })
    ok(p.domainSource === "explicit" && p.domainFilter.join() === "electrical-power", `${p.domainSource}:${p.domainFilter}`)
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
    // DB 어디에도 없는 discovery 노드명을 찾는다
    let picked = ""
    for (const n of g.nodes) {
      const label = String(n.label ?? n.name ?? n.id ?? "")
      if (label.length < 6 || !/^[A-Za-z][A-Za-z0-9 \-]+$/.test(label)) continue
      const hit = all<{ n: number }>("SELECT (SELECT count(*) FROM ontology_aliases WHERE alias = ?) + (SELECT count(*) FROM documents WHERE lower(title) LIKE ?) n", label.toLowerCase(), `%${label.toLowerCase()}%`)[0].n
      if (hit === 0) { picked = label; break }
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

  await t("S8b 위키에만 근거가 있는 질문은 확정 답변 금지(보강 자료로만 안내)", async () => {
    const a = await answerQuestion("PX4 오프보드 제어 모드", { generate: never })
    ok(a.status === "insufficient_evidence" && !a.nim_called, `status=${a.status}`)
    ok(/보강 자료/.test(a.answer) || a.canonical_pages.length === 0, "위키 문서 안내가 보강 자료로 표기되지 않음")
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
