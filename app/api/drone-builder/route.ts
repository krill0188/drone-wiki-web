import { NextRequest } from "next/server"
import { streamText, createUIMessageStreamResponse, toUIMessageStream } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { ragSearch } from "@/lib/rag"
import { graphRagSearch } from "@/lib/graphrag"

// "AI 드론을 기획하고 개발해줘" 같은 요청을 3개 전문 에이전트가 순차 협업해
// 무에서 유로 만들어내는 멀티 에이전트 오케스트레이션.
//   기획서 작성 에이전트 → 스펙 정의 에이전트 → 아키텍처·소스코드 설계 에이전트
// 오케스트레이션 자체(단계 순서 관리)는 클라이언트(app/ai-drone-builder/page.tsx)가
// 맡는다 — 이 라우트는 stage 하나를 받아 그 단계의 에이전트만 실행한다. 각 단계는
// GraphRAG(lib/rag.ts + lib/graphrag.ts)로 지식 베이스를 다시 조회해 근거를 댄다
// (이전 단계 산출물을 그대로 베끼는 게 아니라, 그 단계에 맞는 새 근거를 찾는다).

export const maxDuration = 90

const MODEL_ID = "anthropic/claude-haiku-4.5"
const GROUNDING_EXCERPT_CHARS = 500

type Stage = "proposal" | "spec" | "architecture"

interface StageContext {
  proposal?: string
  spec?: string
}

function buildGroundingBlock(query: string): string {
  const sources = ragSearch(query, 6)
  const graph = graphRagSearch(query, sources.map((s) => s.slug))
  const kb = sources
    .map((s, i) => `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}\n${s.excerpt}`)
    .join("\n\n")
  return `<knowledge-base>\n${kb || "(관련 위키 문서 없음)"}\n</knowledge-base>\n\n${graph.block}`
}

function proposalSystemPrompt(grounding: string): string {
  return `당신은 DroneWiki 소속 '기획서 작성 에이전트'다. 3단계 협업 파이프라인의 1단계를 맡는다
(2단계: 스펙 정의 에이전트, 3단계: 아키텍처·소스코드 설계 에이전트가 이어받는다).
사용자가 제시한 드론 컨셉을 실행 가능한 프로젝트 기획서로 만드는 것이 임무다.

아래는 DroneWiki 지식 베이스에서 검색된 관련 자료(RAG)와 그래프 탐색으로 찾은, 서로 다른
주제를 가로지르는 개념 연결고리다 — 근거로 적극 활용해라. [AI 추출·미검증] 표시가 있는
항목은 참고만 하고 단정하지 마라.

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 배경 및 목적
## 2. 핵심 목표
## 3. 주요 기능
## 4. 운용 시나리오
## 5. 제약사항 및 규정 검토 (지식베이스에 규정 관련 근거가 있으면 반드시 인용, 없으면 "확인 필요")
## 6. 성공 지표(KPI)

원문/지식베이스에 없는 사실을 지어내지 말고, 불확실한 부분은 "확인 필요"로 명시해라. 한국어로 작성.`
}

function specSystemPrompt(grounding: string, context: StageContext): string {
  return `당신은 DroneWiki 소속 '스펙 정의 에이전트'다. 3단계 협업 파이프라인의 2단계를 맡는다.
1단계 기획서 작성 에이전트가 만든 아래 기획서를 받아, 그 목표·기능·제약을 충족하는 구체적인
기술 스펙으로 구체화하는 것이 임무다.

<proposal>
${context.proposal ?? "(기획서 없음)"}
</proposal>

아래는 DroneWiki 지식 베이스에서 검색된 관련 하드웨어·프로토콜·파라미터 자료와 그래프
연결고리다 — 실제 존재하는 하드웨어명·파라미터·프로토콜명을 근거로 스펙을 정하고, 수치를
지어내지 마라(근거가 없으면 "확인 필요"로 표시). [AI 추출·미검증] 항목은 참고만 해라.

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 하드웨어 구성 (FC·센서·통신·배터리·짐벌 등, 표로 정리)
## 2. 소프트웨어 스택 (비행 스택·GCS·미들웨어·온보드 컴퓨터)
## 3. 성능 요구사항 (항속거리·체공시간·페이로드·최대속도 등)
## 4. 통신/프로토콜
## 5. 규정 준수 요건

한국어로 작성.`
}

function architectureSystemPrompt(grounding: string, context: StageContext): string {
  return `당신은 DroneWiki 소속 '아키텍처·소스코드 설계 에이전트'다. 3단계 협업 파이프라인의
마지막 단계를 맡는다. 1단계 기획서와 2단계 기술 스펙을 받아 시스템 아키텍처와 초기 구현
스켈레톤 코드를 설계하는 것이 임무다.

<proposal>
${context.proposal ?? "(기획서 없음)"}
</proposal>

<spec>
${context.spec ?? "(스펙 없음)"}
</spec>

아래는 DroneWiki 지식 베이스의 관련 아키텍처 패턴·파라미터·API 자료와 그래프 연결고리다 —
실제 프로토콜명·파라미터명·API를 정확히 사용해라. [AI 추출·미검증] 항목은 참고만 해라.

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 시스템 아키텍처 개요 (\`\`\`mermaid 다이어그램 코드블록 포함)
## 2. 모듈별 책임
## 3. 핵심 코드 스켈레톤 (스펙에 맞는 언어 선택, 예: PX4 파라미터 스크립트·MAVSDK/ROS2 연동 등, 코드블록으로)
## 4. 개발 로드맵 (마일스톤)

한국어로 작성.`
}

export async function POST(req: NextRequest) {
  const { prompt, stage, context }: { prompt: string; stage: Stage; context?: StageContext } = await req.json()

  if (!prompt?.trim()) {
    return new Response("concept required", { status: 400 })
  }

  const query =
    stage === "proposal"
      ? prompt
      : stage === "spec"
        ? `${prompt} ${(context?.proposal ?? "").slice(0, GROUNDING_EXCERPT_CHARS)}`
        : `${prompt} ${(context?.spec ?? "").slice(0, GROUNDING_EXCERPT_CHARS)}`

  const grounding = buildGroundingBlock(query)

  const system =
    stage === "proposal"
      ? proposalSystemPrompt(grounding)
      : stage === "spec"
        ? specSystemPrompt(grounding, context ?? {})
        : architectureSystemPrompt(grounding, context ?? {})

  const result = streamText({
    model: openrouter(MODEL_ID),
    system,
    prompt: `드론 컨셉: ${prompt}`,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        if (error instanceof Error) return error.message
        return "AI 생성 중 오류가 발생했습니다."
      },
    }),
  })
}
