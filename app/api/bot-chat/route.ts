import { NextRequest } from "next/server"
import { generateText } from "ai"
import { queryKG } from "@/lib/kg"
import { buildOntologyContext } from "@/lib/ontology-qa"
import { evaluateDesignGate } from "@/lib/design-gate"
import { designBlocks } from "@/lib/design-context"
import { buildAgentManifest } from "@/lib/agent-manifest"
import { buildKgSystemPrompt } from "@/lib/chat-system-prompt"
import { botModel, checkBotToken } from "@/lib/bot-model"

export const maxDuration = 60

// 2026-10-04: 텔레그램 봇(claudeclaw) 전용 Q&A 엔드포인트.
// app/api/chat/route.ts(공개 웹)와 RAG+GraphRAG+뉴스검색+지식맵 로직을 완전히
// 공유하되(lib/rag.ts, lib/graphrag.ts, lib/chat-system-prompt.ts 그대로 재사용),
// 봇이 소비하기 쉽게 스트리밍 UI-메시지 프로토콜 대신 평범한 JSON으로 한 번에 응답한다.
// "현재 보고 있는 문서/최근 열람 이력" 같은 브라우저 세션 전용 컨텍스트는 없다(docContext=null).
export async function POST(req: NextRequest) {
  const authError = checkBotToken(req)
  if (authError) return authError

  const { question }: { question?: string } = await req.json()
  if (!question?.trim()) {
    return Response.json({ error: "question required" }, { status: 400 })
  }

  const gate = evaluateDesignGate([question])
  if (gate.reply) return Response.json({ answer: gate.reply, sources: [], newsSources: [] })

  const onto = buildOntologyContext(gate.augment ? `${question}\n${gate.augment}` : question)
  // 지식그래프 전용(웹 채팅과 동일): 수집 문서 검색·뉴스는 사실 근거로 쓰지 않는다.
  const kg = queryKG(question)
  const manifest = await buildAgentManifest()
  const system = buildKgSystemPrompt(manifest, null, [kg.block, gate.block ? designBlocks(gate) : "", onto.block].filter(Boolean).join("\n\n"))

  const result = await generateText({
    model: botModel(),
    system,
    prompt: question,
  })

  return Response.json({
    answer: result.text,
    // 봇 호출부 호환을 위해 필드는 유지하되 수집 문서·뉴스는 더 이상 근거로 쓰지 않는다
    sources: [],
    newsSources: [],
    kgFacts: kg.facts.map((f) => ({ id: f.id, text: f.text })),
  })
}
