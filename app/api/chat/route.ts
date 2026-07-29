import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import { ragSearch, expandGraphNeighbors, searchNews, type RagSource, type NewsHit } from "@/lib/rag"

const UNAVAILABLE_MSG =
  "⚠️ AI 답변을 생성할 수 없습니다.\n\n" +
  "아래 참고 문서를 직접 확인하거나, 지식 그래프에서 관련 개념을 탐색해보세요."

function buildPrompt(
  question: string,
  sources: RagSource[],
  neighbors: { id: string; name: string }[],
  newsHits: NewsHit[]
): string {
  const contextParts = sources.map(
    (s, i) => `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}\n${s.excerpt}`
  )
  if (neighbors.length > 0) {
    contextParts.push(
      `[연관 개념]\n${neighbors.map((n) => `- ${n.name}`).join("\n")}`
    )
  }
  const newsParts = newsHits.map(
    (n, i) => `[N${i + 1}] (${n.type}${n.region ? `/${n.region}` : ""}) ${n.title}${n.excerpt ? ` — ${n.excerpt}` : ""}`
  )

  return `당신은 드론 도메인 전문가 AI입니다. 아래 지식 베이스 문서와 최신 수집 뉴스를 근거로 질문에 완전하고 상세하게 답변하세요.

<knowledge-base>
${contextParts.join("\n\n") || "(관련 위키 문서 없음)"}
</knowledge-base>

<latest-news>
${newsParts.join("\n") || "(관련 최신 뉴스 없음)"}
</latest-news>

질문: ${question}

답변 지침:
- 제공된 문서와 최신 뉴스를 종합하여 구체적으로 답변
- 최신 동향·채용·정부사업·방산 질문이면 <latest-news>를 적극 활용
- 핵심 개념, 작동 원리, 기술 비교, 실용 정보를 충분히 포함
- 소제목이나 목록을 활용해 가독성 있게 구성
- 위키 출처는 [1], 뉴스 출처는 [N1] 형식으로 인용
- 한국어로 답변`
}

async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return ""

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://drone-wiki-web.vercel.app",
      "X-Title": "DroneWiki AI Q&A",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) return ""
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
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
  // 1순위: OpenRouter API (Vercel 공개 서비스)
  const orAnswer = await callOpenRouter(prompt).catch(() => "")
  if (orAnswer) return orAnswer

  // 2순위: 로컬 claude CLI 폴백
  return callClaudeCli(prompt)
}

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 })
  }

  const sources = ragSearch(question, 5)
  const newsHits = searchNews(question, 4)
  const neighbors = sources.length > 0
    ? expandGraphNeighbors(sources.map((s) => s.slug), 4)
    : []

  const prompt = sources.length > 0 || newsHits.length > 0
    ? buildPrompt(question, sources, neighbors, newsHits)
    : `드론 전문가로서 다음 질문에 한국어로 명확하게 답변하세요.\n\n질문: ${question}`

  const answer = await generateAnswer(prompt)

  return NextResponse.json({
    answer: answer || UNAVAILABLE_MSG,
    sources: sources.map((s) => ({ slug: s.slug, title: s.title, domain: s.domain, score: s.score })),
    newsSources: newsHits.map((n) => ({ title: n.title, url: n.url, type: n.type })),
    mode: sources.length > 0 || newsHits.length > 0 ? "rag" : "fallback",
  })
}
