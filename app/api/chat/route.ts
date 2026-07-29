import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import Anthropic from "@anthropic-ai/sdk"
import { ragSearch, expandGraphNeighbors, type RagSource } from "@/lib/rag"

const UNAVAILABLE_MSG =
  "⚠️ AI 답변을 생성할 수 없습니다.\n\n" +
  "아래 참고 문서를 직접 확인하거나, 지식 그래프에서 관련 개념을 탐색해보세요."

function buildPrompt(question: string, sources: RagSource[], neighbors: { id: string; name: string }[]): string {
  const contextParts = sources.map(
    (s, i) => `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}\n${s.excerpt}`
  )
  if (neighbors.length > 0) {
    contextParts.push(
      `[연관 개념]\n${neighbors.map((n) => `- ${n.name}`).join("\n")}`
    )
  }

  return `당신은 드론 도메인 전문가 AI입니다. 아래 지식 베이스 문서를 근거로 질문에 완전하고 상세하게 답변하세요.

<knowledge-base>
${contextParts.join("\n\n")}
</knowledge-base>

질문: ${question}

답변 지침:
- 제공된 문서를 최대한 활용하여 구체적으로 답변
- 핵심 개념, 작동 원리, 기술 비교, 실용 정보를 충분히 포함
- 소제목이나 목록을 활용해 가독성 있게 구성
- 출처는 [1], [2] 형식으로 인용
- 한국어로 답변`
}

async function callAnthropicSdk(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ""

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  })
  const block = msg.content[0]
  return block.type === "text" ? block.text : ""
}

function callClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["-p"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 90000,
    })
    let out = ""
    let err = ""
    proc.stdout.on("data", (d: Buffer) => { out += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { err += d.toString() })
    proc.on("error", () => resolve(""))
    proc.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out.trim())
      else if (err.trim() && !err.includes("command not found")) resolve(err.trim())
      else resolve("")
    })
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function generateAnswer(prompt: string): Promise<string> {
  // 1순위: Anthropic SDK (Vercel 환경 포함)
  const sdkAnswer = await callAnthropicSdk(prompt).catch(() => "")
  if (sdkAnswer) return sdkAnswer

  // 2순위: 로컬 claude CLI 폴백
  return callClaudeCli(prompt)
}

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 })
  }

  const sources = ragSearch(question, 5)
  const neighbors = sources.length > 0
    ? expandGraphNeighbors(sources.map((s) => s.slug), 4)
    : []

  const prompt = sources.length > 0
    ? buildPrompt(question, sources, neighbors)
    : `드론 전문가로서 다음 질문에 한국어로 명확하게 답변하세요.\n\n질문: ${question}`

  const answer = await generateAnswer(prompt)

  return NextResponse.json({
    answer: answer || UNAVAILABLE_MSG,
    sources: sources.map((s) => ({ slug: s.slug, title: s.title, domain: s.domain, score: s.score })),
    mode: sources.length > 0 ? "rag" : "fallback",
  })
}
