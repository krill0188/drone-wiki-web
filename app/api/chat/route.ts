import { NextRequest } from "next/server"
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { wikiModel } from "@/lib/ai-model"
import { kgSummary, queryKG } from "@/lib/kg"
import { buildOntologyContext } from "@/lib/ontology-qa"
import { evaluateDesignGate } from "@/lib/design-gate"
import { designBlocks } from "@/lib/design-context"
import { designEvidence } from "@/lib/evidence"
import { buildKgSystemPrompt } from "@/lib/chat-system-prompt"
import type { DocContext } from "@/lib/types"
import type { DocViewRecord } from "@/lib/session-store"

export const maxDuration = 120


function extractQuestion(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  if (!lastUser) return ""
  return lastUser.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

function textOf(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

// 설계 게이트의 즉답(재질문·추론상 불가)을 AI 호출 없이 UI 스트림으로 내려보낸다.
function instantReply(text: string) {
  const id = "design-gate"
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start" })
        writer.write({ type: "text-start", id })
        writer.write({ type: "text-delta", id, delta: text })
        writer.write({ type: "text-end", id })
        writer.write({ type: "finish", messageMetadata: { sources: [], ontologyClasses: [], newsSources: [] } })
      },
    }),
  })
}

export async function POST(req: NextRequest) {
  const {
    messages,
    docContext,
    recentDocs,
  }: { messages: UIMessage[]; docContext?: DocContext | null; recentDocs?: DocViewRecord[] } =
    await req.json()

  const question = extractQuestion(messages)

  // 설계 질문 게이트: 필수 4항목(페이로드·비행가능거리·크기·비행시간) 확인 + 물리 실현가능성 판정
  const userTexts = messages.filter((m) => m.role === "user").map(textOf)
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  const gate = evaluateDesignGate(userTexts, lastAssistant ? textOf(lastAssistant) : "")
  if (gate.reply) return instantReply(gate.reply)
  // 지식그래프 전용(2026-10-19): 수집 문서 검색(RAG)·뉴스·문서 연결 그래프는 사실 근거로 쓰지 않는다.
  // 사실은 지식그래프(queryKG)·규칙 엔진(onto)·설계 엔진(designBlocks)에서만 나온다.
  const onto = buildOntologyContext(gate.augment ? `${question}\n${gate.augment}` : question, docContext?.title, { kgOnly: true })
  const kg = queryKG(docContext ? `${docContext.title} ${question}` : question)
  const manifest = kgSummary()
  const blocks = [kg.block, gate.block ? designBlocks(gate) : "", onto.block].filter(Boolean).join("\n\n")
  const system = buildKgSystemPrompt(manifest, docContext ?? null, blocks)

  const result = streamText({
    model: wikiModel(),
    system,
    messages: await convertToModelMessages(messages),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return {
            ontologyClasses: onto.classes,
            kgFacts: kg.facts,
            evidence: gate.block ? designEvidence() : undefined,
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
