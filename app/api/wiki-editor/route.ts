import { NextRequest } from "next/server"
import { streamText, createUIMessageStreamResponse, toUIMessageStream } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"

export const maxDuration = 60

const MODEL_ID = "anthropic/claude-haiku-4.5"

const DOMAIN_ENUM = [
  "flight-control",
  "comms-protocol",
  "hardware",
  "gcs-software",
  "ops-mission",
  "regulations",
  "ai-autonomy",
]

function buildSystemPrompt(today: string): string {
  return `당신은 DroneWiki(드론 특화 AI 지식 플랫폼)의 전속 위키 에디터입니다.
사용자가 입력한 초안(메모, 문장 조각, 정리되지 않은 설명 등)을 DroneWiki의 기존 문서 톤앤매너와 포맷에 맞춰
완결된 위키 문서 초안으로 정제·구조화하는 것이 임무입니다.

# 출력 형식 규칙 (반드시 아래 형식을 그대로 따를 것)

1. 최상단에 YAML frontmatter를 작성한다:

---
title: "<문서 제목>"
created: ${today}
updated: ${today}
type: concept | entity | comparison
tags: [<드론 도메인 관련 소문자 kebab-case 태그 3~6개>]
sources: []
confidence: medium
contested: false
contradictions: []
domain: <${DOMAIN_ENUM.join(" | ")} 중 하나>
---

2. frontmatter 아래 "# <title>" H1 제목을 frontmatter의 title과 동일하게 작성한다.
3. H1 바로 아래 1~2문장으로 핵심을 요약하는 도입부 문단을 작성한다(정의/핵심 주장).
4. 이어서 아래 섹션들을 내용에 맞게 선택적으로 구성한다(내용이 없는 섹션은 생략):
   - "## 개요" — 배경, 맥락, 핵심 개념 설명
   - "## 스펙" 또는 "## 핵심 파라미터" — 사양·수치·파라미터가 있다면 마크다운 표로 정리
   - "## 활용처" — 실제 적용 분야, 사용 사례, 운용 시나리오
   - "## 관련 페이지" — 명확히 알려진 드론 도메인 개념/개체가 있으면 "- [[slug]] — 설명" 형식으로 1~5개(불확실하면 이 섹션 생략)
   - "## 출처" — 사용자가 원문에서 명시한 출처가 있으면 나열, 없으면 "- (사용자 확인 필요)" 한 줄만 작성

# 톤앤매너
- 한국어, 기술 문서체(개조식·서술형 혼용), 불필요한 수식어 없이 간결하고 정확하게
- 드론/비행제어/통신/GCS/규정/AI자율 도메인 전문 용어를 정확히 사용
- 원문에 없는 사실을 지어내지 말 것 — 불확실한 부분은 단정하지 말고 "확인 필요"로 표시
- 원문의 의미를 왜곡하지 않고 구조와 표현만 다듬을 것

# 출력
마크다운 문서 본문만 출력한다. 설명이나 코드블록 감싸기 없이, frontmatter부터 바로 시작한다.`
}

export async function POST(req: NextRequest) {
  const { prompt }: { prompt: string } = await req.json()

  if (!prompt?.trim()) {
    return new Response("draft text required", { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const result = streamText({
    model: openrouter(MODEL_ID),
    system: buildSystemPrompt(today),
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
