import { NextRequest } from "next/server"
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { ragSearch, searchNews } from "@/lib/rag"
import { graphRagSearch } from "@/lib/graphrag"
import { buildAgentManifest } from "@/lib/agent-manifest"
import { buildSystemPrompt } from "@/lib/chat-system-prompt"
import type { DocContext } from "@/lib/types"
import type { DocViewRecord } from "@/lib/session-store"

export const maxDuration = 60

const MODEL_ID = "anthropic/claude-haiku-4.5"

function extractQuestion(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  if (!lastUser) return ""
  return lastUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

export async function POST(req: NextRequest) {
  const {
    messages,
    docContext,
    recentDocs,
  }: { messages: UIMessage[]; docContext?: DocContext | null; recentDocs?: DocViewRecord[] } =
    await req.json()

  const question = extractQuestion(messages)
  // 현재 보고 있는 문서 제목을 검색어에 섞어 RAG 검색을 문서 맥락에 맞춰 편향시킨다.
  const ragQuery = docContext ? `${docContext.title} ${question}` : question

  const sources = ragQuery ? ragSearch(ragQuery, 6, { diversify: true }) : []
  const newsHits = ragQuery ? searchNews(ragQuery, 4) : []
  // 벡터/키워드로 찾은 canonical 시드에서 출발해 canonical+discovery 그래프를
  // 함께 멀티홉 탐색 — 드론 지식과 AI 지식을 잇는 연결고리를 찾는 GraphRAG 레이어.
  const graph = ragQuery ? graphRagSearch(ragQuery, sources.map((s) => s.slug)) : { block: "", usedDiscovery: false }
  const manifest = await buildAgentManifest()

  const system = buildSystemPrompt(manifest, docContext ?? null, recentDocs ?? [], sources, graph.block, newsHits)

  const result = streamText({
    model: openrouter(MODEL_ID),
    system,
    messages: await convertToModelMessages(messages),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return {
            sources: sources.map((s) => ({
              slug: s.slug,
              title: s.title,
              domain: s.domain,
              excerpt: s.excerpt,
              origin: s.origin,
              sourceUrl: s.properties?.source || s.properties?.source_url,
            })),
            newsSources: newsHits.map((n) => ({ title: n.title, url: n.url, type: n.type })),
          }
        }
      },
      onError: (error) => {
        if (error instanceof Error) return error.message
        return "AI 응답 생성 중 오류가 발생했습니다."
      },
    }),
  })
}
