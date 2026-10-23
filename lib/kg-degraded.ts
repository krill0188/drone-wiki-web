import type { NimContext } from "./kg-context"
import type { Plan } from "./kg-plan"
import { renderEntityTables } from "./kg-table"
import { soften } from "./soften"

// 모든 AI 모델이 응답하지 않을 때(NIM 체인 + OpenRouter 폴백 소진) 서버가 확인한 근거만 보여 주는 답변(2026-10-23).
// 판정·사양표·검증 claim·관계·위키 발췌는 이미 서버가 만들어 두었으므로 모델 없이도 근거 자체를 전달할 수 있다.
// 모델 해설이 없으므로 새 문장을 만들지 않고 context의 값만 옮긴다(숫자 모두 context 안).
export function degradedAnswer(plan: Plan, ctx: NimContext): string {
  const parts: string[] = ["⚠️ AI 해설 모델이 일시적으로 응답하지 않아, 서버가 확인한 근거만 그대로 보여 드립니다. 해설·요약은 없으며 잠시 후 다시 질문하면 해설이 붙습니다."]
  const table = renderEntityTables(plan)
  if (table) parts.push(table)
  const claims = ctx.verified_claims.filter((c) => c.origin !== "wiki").slice(0, 6)
  const wiki = ctx.verified_claims.filter((c) => c.origin === "wiki").slice(0, 4)
  if (claims.length) parts.push("**검증된 claim**\n" + claims.map((c) => `- ${c.subject} · ${c.predicate}: ${c.value}${c.unit ? ` ${c.unit}` : ""} [${c.ref}]`).join("\n"))
  if (wiki.length) parts.push("**위키 요약 기반 claim(원문 대조 전)**\n" + wiki.map((c) => `- ${c.subject} · ${c.predicate}: ${c.value} [${c.ref}]`).join("\n"))
  const rels = ctx.ontology_relations.slice(0, 6)
  if (rels.length) parts.push("**온톨로지 관계**\n" + rels.map((r) => `- ${r.subject} —${r.predicate}→ ${r.object} [${r.ref}]`).join("\n"))
  const pages = ctx.canonical_pages.slice(0, 3)
  if (pages.length) parts.push("**관련 위키 문서 발췌**\n" + pages.map((p) => `- **${p.title}** [${p.ref}]: ${p.excerpt.slice(0, 280)}${p.excerpt.length > 280 ? "…" : ""}`).join("\n"))
  if (ctx.limitations.length) parts.push("**한계**\n" + ctx.limitations.slice(0, 3).map((l) => `- ${l}`).join("\n"))
  return soften(parts.join("\n\n"))
}
