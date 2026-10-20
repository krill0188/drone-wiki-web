import { all } from "./kdb"
import { contentTokens, REGULATORY, type Plan } from "./kg-plan"

// 법령·규제 질문 전용 인용 답변. 모델이 풀어 쓰면 조문 조건을 섞거나 용어를 바꾸므로(2026-10-20 시험: 250g 증명 면제를 신고·과태료와 혼합),
// 서버가 regulations 문서에서 질문과 맞는 문장을 원문 그대로 골라 보여 준다. NIM은 호출하지 않는다.
export interface VerbatimAnswer { text: string; pages: { path: string; title: string; domain: string | null }[] }

export function verbatimAnswer(plan: Plan): VerbatimAnswer | null {
  if (plan.status !== "ready" || !REGULATORY.test(plan.question)) return null
  // 법제처 조문 수집분(출처 표기가 kr-reg 원문 파일인 문서)만 대상으로 한다 — 같은 domain의 논문 요약·뉴스는 문장 인용 대상이 아니다
  const regPages = plan.pages.filter((p) => p.domain === "regulations" && (all<{ body: string }>("SELECT body FROM documents WHERE path = ?", p.path)[0]?.body ?? "").includes("fetch-2026-10-20-kr-reg"))
  if (!regPages.length) return null
  // 질문의 법령 용어(허가·신고·증명 등)는 일반어로 걸러져 내용어에서 빠질 수 있어 따로 더한다
  const regWords = [...new Set(plan.question.match(new RegExp(REGULATORY.source, "g")) ?? [])].map((w) => ({ orig: w, variants: [w] }))
  const toks = [...contentTokens(plan.question), ...regWords]
  const nums = [...plan.question.matchAll(/\d+(?:\.\d+)?\s*(?:kg|g|m|km|ft|원|만원)?/gi)].map((m) => m[0].replace(/\s+/g, "").toLowerCase())
  type Hit = { score: number; line: string; page: number }
  const hits: Hit[] = []
  regPages.forEach((p, pi) => {
    const body = all<{ body: string }>("SELECT body FROM documents WHERE path = ?", p.path)[0]?.body ?? ""
    let heading = ""
    for (const raw of body.split("\n")) {
      if (/^#{1,4}\s/.test(raw)) heading = raw.replace(/^#+\s*/, "")
      const m = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)
      if (!m) continue
      if (raw.includes("[[") || /KCI|보도|윤민철/.test(raw)) continue // 링크 목록·논문·보도 메모는 조문 문장이 아니다
      const line = m[1].replace(/\s*\^\[[^\]]*\]/g, "").trim()
      if (line.length < 12) continue
      const low = line.toLowerCase().replace(/\s+/g, "")
      // 문장 자체 + 그 문장이 속한 절 제목('## 과태료(제166조)')에서 질문어를 찾는다. 법령 용어는 허가·승인을 섞어 쓰므로 동의어로 함께 본다.
      const hay = `${line} ${heading}`.toLowerCase()
      const syn = (v: string) => (v === "허가" ? ["허가", "승인"] : v === "승인" ? ["승인", "허가"] : [v])
      const matched = toks.filter((t) => t.variants.flatMap(syn).some((v) => hay.includes(v))).length
      const numHit = nums.filter((n) => low.includes(n)).length
      if (!matched && !numHit) continue
      const titleHit = toks.filter((t) => t.variants.some((v) => p.title.toLowerCase().includes(v))).length
      hits.push({ score: matched + numHit * 1.5 + titleHit * 0.5, line, page: pi })
    }
  })
  hits.sort((a, b) => b.score - a.score || a.page - b.page)
  const top = hits[0]?.score ?? 0
  const picked = hits.filter((h) => h.score >= Math.max(1, top * 0.5)).slice(0, 6)
  if (!picked.length) return null
  const used = [...new Set(picked.map((h) => h.page))].sort((a, b) => a - b)
  const lines = picked.map((h) => `- ${h.line} [P${used.indexOf(h.page) + 1}]`)
  const src = used.map((pi, i) => `[P${i + 1}] ${regPages[pi].title} (${regPages[pi].path})`).join("\n")
  const text = `법령·규제 질문이라 위키에 정리된 조문 요약을 풀어 쓰지 않고 **문장 그대로** 보여 드립니다. (온톨로지 개체·관계에는 직접 연결되지 않은 위키 요약 기반이며, 법제처 원문과 문자 단위로 대조된 것은 아닙니다.)\n\n${lines.join("\n")}\n\n**출처 문서**\n${src}\n\n**한계**\n- 수집본은 법제처 조문 발췌입니다. 표(별표)와 시행령·고시의 세부 금액·구역은 포함되지 않은 것이 있습니다.\n- 조건이 여러 기준으로 나뉘는 규정(예: 신고 면제 2kg 이하, 조종자 증명 면제 250g 이하)은 서로 다른 기준이므로 위 문장을 각각 확인하세요.`
  return { text, pages: used.map((pi) => ({ path: regPages[pi].path, title: regPages[pi].title, domain: regPages[pi].domain })) }
}
