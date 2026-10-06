import { NextRequest } from "next/server"
import { generateText } from "ai"
import { ragSearch, searchNews } from "@/lib/rag"
import { graphRagSearch } from "@/lib/graphrag"
import { buildAgentManifest } from "@/lib/agent-manifest"
import { buildSystemPrompt } from "@/lib/chat-system-prompt"
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

  const sources = ragSearch(question, 6, { diversify: true })
  const newsHits = searchNews(question, 4)
  const graph = graphRagSearch(question, sources.map((s) => s.slug))
  const manifest = await buildAgentManifest()
  const system = buildSystemPrompt(manifest, null, [], sources, graph.block, newsHits)

  const result = await generateText({
    model: botModel(),
    system,
    prompt: question,
  })

  return Response.json({
    answer: result.text,
    sources: sources.map((s) => ({ slug: s.slug, title: s.title, domain: s.domain, origin: s.origin })),
    newsSources: newsHits.map((n) => ({ title: n.title, url: n.url, type: n.type })),
  })
}
