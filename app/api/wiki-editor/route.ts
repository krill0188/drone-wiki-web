import { NextRequest } from "next/server"
import { streamText, createUIMessageStreamResponse, toUIMessageStream } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { buildWikiStyleSystemPrompt } from "@/lib/wiki-style-prompt"

export const maxDuration = 60

const MODEL_ID = "anthropic/claude-haiku-4.5"

export async function POST(req: NextRequest) {
  const { prompt }: { prompt: string } = await req.json()

  if (!prompt?.trim()) {
    return new Response("draft text required", { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const system = buildWikiStyleSystemPrompt(
    today,
    "사용자가 입력한 초안(메모, 문장 조각, 정리되지 않은 설명 등)을 DroneWiki의 기존 문서 톤앤매너와 포맷에 맞춰 완결된 위키 문서 초안으로 정제·구조화하는 것이 임무입니다."
  )

  const result = streamText({
    model: openrouter(MODEL_ID),
    system,
    prompt: `다음 초안을 DroneWiki 문서 형식으로 정제해줘:\n\n${prompt}`,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        if (error instanceof Error) return error.message
        return "AI 문서 생성 중 오류가 발생했습니다."
      },
    }),
  })
}
