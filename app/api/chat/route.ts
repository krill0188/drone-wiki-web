import { NextRequest } from "next/server"
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { ragSearch, searchNews, type RagSource, type NewsHit } from "@/lib/rag"
import { graphRagSearch } from "@/lib/graphrag"
import { buildAgentManifest } from "@/lib/agent-manifest"
import type { DocContext } from "@/lib/types"

export const maxDuration = 60

const MODEL_ID = "anthropic/claude-haiku-4.5"
const DOC_CONTEXT_MAX_CHARS = 4000

function buildSystemPrompt(
  manifest: string,
  docContext: DocContext | null,
  sources: RagSource[],
  graphBlock: string,
  newsHits: NewsHit[]
): string {
  const contextParts = sources.map(
    (s, i) => `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}\n${s.excerpt}`
  )
  const newsParts = newsHits.map(
    (n, i) => `[N${i + 1}] (${n.type}${n.region ? `/${n.region}` : ""}) ${n.title}${n.excerpt ? ` — ${n.excerpt}` : ""}`
  )

  const currentDocBlock = docContext
    ? `사용자가 지금 화면에서 보고 있는 문서:
<current-document slug="${docContext.slug}" title="${docContext.title}">
${docContext.content.slice(0, DOC_CONTEXT_MAX_CHARS)}
</current-document>

`
    : ""

  return `당신은 드론 도메인 전문가 AI입니다. 아래 컨텍스트(위키 전체 지도, 현재 보고 있는 문서, RAG로 검색된 지식 베이스, 최신 뉴스)를 근거로 사용자 질문에 완전하고 상세하게 답변하세요.

${manifest}

${currentDocBlock}<knowledge-base>
${contextParts.join("\n\n") || "(관련 위키 문서 없음)"}
</knowledge-base>

${graphBlock ? `${graphBlock}\n\n` : ""}<latest-news>
${newsParts.join("\n") || "(관련 최신 뉴스 없음)"}
</latest-news>

답변 지침:
- <current-document>가 있으면 그 내용을 최우선 근거로 삼아 답변
- 지식 베이스와 최신 뉴스를 종합하여 구체적으로 답변
- <graph-connections>가 있으면 서로 다른 주제·도메인 사이의 연결고리를 설명할 때
  적극 활용해, 문서 하나로는 안 보이는 융합적 답변을 제공(특정 두 분야로 한정하지 말고
  질문에 실제로 걸리는 모든 영역을 자유롭게 연결)
- 최신 동향·채용·정부사업·방산 질문이면 <latest-news>를 적극 활용
- 핵심 개념, 작동 원리, 기술 비교, 실용 정보를 충분히 포함
- 소제목이나 목록을 활용해 가독성 있게 구성
- 위키 출처는 [1], 뉴스 출처는 [N1] 형식으로 인용
- 한국어로 답변`
}

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
  const { messages, docContext }: { messages: UIMessage[]; docContext?: DocContext | null } =
    await req.json()

  const question = extractQuestion(messages)
  // 현재 보고 있는 문서 제목을 검색어에 섞어 RAG 검색을 문서 맥락에 맞춰 편향시킨다.
  const ragQuery = docContext ? `${docContext.title} ${question}` : question

  const sources = ragQuery ? ragSearch(ragQuery, 5) : []
  const newsHits = ragQuery ? searchNews(ragQuery, 4) : []
  // 벡터/키워드로 찾은 canonical 시드에서 출발해 canonical+discovery 그래프를
  // 함께 멀티홉 탐색 — 드론 지식과 AI 지식을 잇는 연결고리를 찾는 GraphRAG 레이어.
  const graph = ragQuery ? graphRagSearch(ragQuery, sources.map((s) => s.slug)) : { block: "", usedDiscovery: false }
  const manifest = await buildAgentManifest()

  const system = buildSystemPrompt(manifest, docContext ?? null, sources, graph.block, newsHits)

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
            sources: sources.map((s) => ({ slug: s.slug, title: s.title, domain: s.domain })),
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
