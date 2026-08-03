import { NextRequest } from "next/server"
import { streamText, createUIMessageStreamResponse, toUIMessageStream } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { buildWikiStyleSystemPrompt } from "@/lib/wiki-style-prompt"
import { readSourceExcerpt } from "@/lib/discovery-review"

export const maxDuration = 60

const MODEL_ID = "anthropic/claude-haiku-4.5"

interface RelatedEdge {
  name: string
  type: string
}

export async function POST(req: NextRequest) {
  const {
    name,
    ontologyClass,
    sources,
    outgoing,
    incoming,
  }: {
    name: string
    ontologyClass: string
    sources: string[]
    outgoing: RelatedEdge[]
    incoming: RelatedEdge[]
  } = await req.json()

  if (!name?.trim()) {
    return new Response("name required", { status: 400 })
  }

  const excerpt = sources?.[0] ? readSourceExcerpt(sources[0]) : ""
  const relations = [
    ...(outgoing ?? []).map((o) => `- ${name} --[${o.type}]--> ${o.name}`),
    ...(incoming ?? []).map((i) => `- ${i.name} --[${i.type}]--> ${name}`),
  ]

  const context = `개념명: ${name}
분류: ${ontologyClass}
원문 근거 발췌(${sources?.[0] ?? "출처 없음"}):
${excerpt || "(발췌 없음)"}

그래프 탐색으로 발견된 관계:
${relations.join("\n") || "(관계 없음)"}`

  const today = new Date().toISOString().slice(0, 10)
  const system = buildWikiStyleSystemPrompt(
    today,
    "지금 다루는 개념은 raw 원문에서 LLM(LangChain 지식그래프 추출 파이프라인)이 자동 추출했고 아직 사람이 검토하지 않았습니다. 아래 원문 발췌와 그래프 관계에 실제로 있는 사실만 사용하고, 발췌에 없는 내용은 지어내지 말고 반드시 \"확인 필요\"로 표시하세요."
  )

  const result = streamText({
    model: openrouter(MODEL_ID),
    system,
    prompt: `다음 자동 추출된 개념을 DroneWiki 문서 형식 초안으로 정제해줘:\n\n${context}`,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        if (error instanceof Error) return error.message
        return "AI 초안 생성 중 오류가 발생했습니다."
      },
    }),
  })
}
