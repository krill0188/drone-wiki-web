import { NextRequest } from "next/server"
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { wikiModel } from "@/lib/ai-model"
import { ragSearch, searchNews } from "@/lib/rag"
import { graphRagSearch } from "@/lib/graphrag"
import { buildOntologyContext } from "@/lib/ontology-qa"
import { evaluateDesignGate } from "@/lib/design-gate"
import { buildAgentManifest } from "@/lib/agent-manifest"
import { buildSystemPrompt } from "@/lib/chat-system-prompt"
import type { DocContext } from "@/lib/types"
import type { DocViewRecord } from "@/lib/session-store"

export const maxDuration = 120


function extractQuestion(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  if (!lastUser) return ""
  return lastUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

function textOf(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

// 설계 게이트의 즉답(재질문·추론상 불가)을 AI 호출 없이 UI 스트림으로 내려보낸다.
function instantReply(text: string) {
  const id = "design-gate"
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start" })
        writer.write({ type: "text-start", id })
        writer.write({ type: "text-delta", id, delta: text })
        writer.write({ type: "text-end", id })
        writer.write({ type: "finish", messageMetadata: { sources: [], ontologyClasses: [], newsSources: [] } })
      },
    }),
  })
}

export async function POST(req: NextRequest) {
  const {
    messages,
    docContext,
    recentDocs,
  }: { messages: UIMessage[]; docContext?: DocContext | null; recentDocs?: DocViewRecord[] } =
    await req.json()

  const question = extractQuestion(messages)

  // 설계 질문 게이트: 필수 4항목(페이로드·비행가능거리·크기·비행시간) 확인 + 물리 실현가능성 판정
  const userTexts = messages.filter((m) => m.role === "user").map(textOf)
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const gate = evaluateDesignGate(userTexts, lastAssistant ? textOf(lastAssistant) : "")
  if (gate.reply) return instantReply(gate.reply)
  // 현재 보고 있는 문서 제목을 검색어에 섞어 RAG 검색을 문서 맥락에 맞춰 편향시킨다.
  const ragQuery = docContext ? `${docContext.title} ${question}` : question

  // 온톨로지 우선: 질문을 클래스로 해석하고, 클래스명을 검색어에 보태 관련 카탈로그가 올라오게 한다.
  const onto = buildOntologyContext(gate.augment ? `${question}\n${gate.augment}` : question, docContext?.title)
  const searchQuery = onto.classes.length ? `${ragQuery} ${onto.classes.join(" ")}` : ragQuery
  const sources = ragQuery ? ragSearch(searchQuery, 6, { diversify: true }) : []
  const newsHits = ragQuery ? searchNews(ragQuery, 4) : []
  // 벡터/키워드로 찾은 canonical 시드에서 출발해 canonical+discovery 그래프를
  // 함께 멀티홉 탐색 — 드론 지식과 AI 지식을 잇는 연결고리를 찾는 GraphRAG 레이어.
  const graph = ragQuery ? graphRagSearch(ragQuery, sources.map((s) => s.slug)) : { block: "", usedDiscovery: false }
  const manifest = await buildAgentManifest()

  const system = buildSystemPrompt(manifest, docContext ?? null, recentDocs ?? [], sources, graph.block, newsHits, gate.block ? `${gate.block}\n${onto.block}` : onto.block)

  const result = streamText({
    model: wikiModel(),
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
            ontologyClasses: onto.classes,
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
