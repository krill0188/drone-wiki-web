import { NextRequest } from "next/server"
import { generateText } from "ai"
import { buildWikiStyleSystemPrompt } from "@/lib/wiki-style-prompt"
import { botModel, checkBotToken } from "@/lib/bot-model"

export const maxDuration = 60

// 2026-10-04: 텔레그램 봇(claudeclaw) 전용 위키 에디터 엔드포인트.
// app/api/wiki-editor/route.ts(공개 웹)와 동일한 buildWikiStyleSystemPrompt를
// 재사용하되, 스트리밍 대신 평범한 JSON 응답.
export async function POST(req: NextRequest) {
  const authError = checkBotToken(req)
  if (authError) return authError

  const { draft }: { draft?: string } = await req.json()
  if (!draft?.trim()) {
    return Response.json({ error: "draft required" }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const system = buildWikiStyleSystemPrompt(
    today,
    "사용자가 입력한 초안(메모, 문장 조각, 정리되지 않은 설명 등)을 DroneWiki의 기존 문서 톤앤매너와 포맷에 맞춰 완결된 위키 문서 초안으로 정제·구조화하는 것이 임무입니다."
  )

  const result = await generateText({
    model: botModel(),
    system,
    prompt: `다음 초안을 DroneWiki 문서 형식으로 정제해줘:\n\n${draft}`,
  })

  return Response.json({ draft: result.text })
}
