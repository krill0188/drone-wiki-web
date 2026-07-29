import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import { ragSearch, expandGraphNeighbors, type RagSource } from "@/lib/rag"

const UNAVAILABLE_MSG =
  "⚠️ AI 답변 기능은 로컬 환경에서만 동작합니다.\n\n" +
  "위키 페이지에서 관련 문서를 직접 검색하거나, 지식 그래프를 통해 개념을 탐색해보세요."

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

function buildPrompt(question: string, sources: RagSource[], neighbors: { id: string; name: string }[]): string {
  const contextParts = sources.map(
    (s, i) => `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}\n${s.excerpt}`
  )
  if (neighbors.length > 0) {
    const neighborList = neighbors.map((n) => `- ${n.name} (${n.id})`).join("\n")
    contextParts.push(`[연관 개념]\n${neighborList}`)
  }
  const context = contextParts.join("\n\n")

  return `당신은 드론 도메인 전문가 AI입니다. 아래 지식 베이스 문서를 근거로 질문에 완전하고 상세하게 답변하세요.

<knowledge-base>
${context}
</knowledge-base>

질문: ${question}

답변 지침:
- 제공된 문서를 최대한 활용하여 구체적으로 답변
- 핵심 개념, 작동 원리, 기술 비교, 실용 정보를 충분히 포함
- 소제목이나 목록을 활용해 가독성 있게 구성
- 출처는 [1], [2] 형식으로 인용
- 한국어로 답변`
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

  if (sources.length === 0) {
    const fallbackPrompt =
      `드론 전문가로서 다음 질문에 한국어로 명확하게 답변하세요.\n\n질문: ${question}`
    const answer = await callClaudeCli(fallbackPrompt)
    return NextResponse.json({ answer: answer || UNAVAILABLE_MSG, sources: [], mode: "fallback" })
  }

  const prompt = buildPrompt(question, sources, neighbors)
  const answer = await callClaudeCli(prompt)

  return NextResponse.json({
    answer: answer || UNAVAILABLE_MSG,
    sources: sources.map((s) => ({ slug: s.slug, title: s.title, domain: s.domain, score: s.score })),
    mode: "rag",
  })
}
