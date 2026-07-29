import { NextRequest, NextResponse } from "next/server"
import { ragSearch, getSubgraph } from "@/lib/rag"
import { getNewsFeed, type NewsType } from "@/lib/news"

export const maxDuration = 60

interface Card {
  emoji: string
  heading: string
  body: string
}

interface CardNews {
  title: string
  cards: Card[]
  hashtags: string[]
}

function buildPrompt(newsBlock: string, wikiBlock: string): string {
  return `당신은 드론 전문 SNS 카드뉴스 작가입니다. 아래 최신 뉴스와 위키 지식을 학습하여 카드뉴스를 작성하세요.

<최신뉴스>
${newsBlock}
</최신뉴스>

<위키지식>
${wikiBlock}
</위키지식>

작성 규칙:
- 커버 1장(호기심 유발 헤드라인) + 내용 4~5장(뉴스 핵심을 위키 지식으로 해설) + 마무리 1장(핵심 요약/전망)
- heading은 20자 이내, body는 2문장 80자 이내, SNS 톤(간결·임팩트)
- 위키 지식으로 배경·용어를 풀어 초보자도 이해하게
- 반드시 아래 JSON만 출력 (설명·코드펜스 금지):
{"title":"카드뉴스 제목","cards":[{"emoji":"🛸","heading":"...","body":"..."}],"hashtags":["#드론","..."]}`
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
      "X-Title": "DroneWiki CardNews",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(55000),
  })
  if (!res.ok) return ""
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

function parseCardNews(raw: string): CardNews | null {
  const jsonText = raw.replace(/```(?:json)?/g, "").trim()
  const start = jsonText.indexOf("{")
  const end = jsonText.lastIndexOf("}")
  if (start === -1 || end === -1) return null
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1))
    if (!parsed.title || !Array.isArray(parsed.cards) || parsed.cards.length === 0) return null
    return {
      title: String(parsed.title),
      cards: parsed.cards
        .filter((c: any) => c?.heading && c?.body)
        .map((c: any) => ({
          emoji: String(c.emoji || "🛸"),
          heading: String(c.heading),
          body: String(c.body),
        })),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const { type = "", region = "", domain = "", count = 6 } = await req.json().catch(() => ({}))

  // 1) 뉴스 선택 (필터 기준 최신 N건)
  const items = getNewsFeed()
    .filter((it) => {
      const matchT = !type || it.type === (type as NewsType)
      const matchR = !region || (region === "KR" ? it.region === "KR" : it.region !== "KR")
      const matchD = !domain || it.domain === domain
      return matchT && matchR && matchD
    })
    .slice(0, Math.min(Number(count) || 6, 10))

  if (items.length === 0) {
    return NextResponse.json({ error: "해당 조건의 뉴스가 없습니다" }, { status: 404 })
  }

  // 2) NotebookLM식 학습 컨텍스트: 뉴스 제목·요약으로 위키 RAG 검색
  const query = items.map((it) => it.title).join(" ")
  const sources = ragSearch(query, 4)
  const subgraph = getSubgraph(sources.map((s) => s.slug), 8)

  const newsBlock = items
    .map((it, i) => `${i + 1}. [${it.type}] ${it.title}${it.summary ? ` — ${it.summary}` : ""} (출처: ${it.source})`)
    .join("\n")
  const wikiBlock = sources.length
    ? sources.map((s) => `- ${s.title}: ${s.excerpt.slice(0, 300)}`).join("\n")
    : "(관련 위키 문서 없음 — 일반 지식으로 해설)"

  // 3) 카드뉴스 생성
  const raw = await callOpenRouter(buildPrompt(newsBlock, wikiBlock)).catch(() => "")
  const cardNews = parseCardNews(raw)

  if (!cardNews) {
    return NextResponse.json({ error: "카드뉴스 생성에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 502 })
  }

  return NextResponse.json({
    ...cardNews,
    newsUsed: items.map((it) => ({ title: it.title, url: it.url, type: it.type })),
    wikiSources: sources.map((s) => ({ slug: s.slug, title: s.title, domain: s.domain })),
    subgraph,
  })
}
