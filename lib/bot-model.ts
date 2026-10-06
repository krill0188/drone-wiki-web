import { openrouter } from "@openrouter/ai-sdk-provider"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

// 2026-10-04: 텔레그램 봇 전용 라우트(app/api/bot-*)에서만 쓰는 모델 선택.
//
// 공개 웹 라우트(app/api/chat, app/api/wiki-editor)는 건드리지 않고 OpenRouter를
// 그대로 쓴다 — Vercel 프로덕션 서버는 이 Mac의 localhost:2455(codex-lb)에 접근할
// 수 없기 때문에, 로컬 전용 모델을 그 라우트들에 섞으면 배포본이 깨진다.
//
// 이 헬퍼는 "LOCAL_LLM_BASE_URL이 .env.local에 설정돼 있을 때만" codex-lb(로컬
// ChatGPT 계정 풀, Claude 계정과 무관, ~/projectm/scripts/ai_router.py와 동일 자원)를
// 쓰고, 없으면(= Vercel 프로덕션이거나 로컬에서도 아직 설정 안 했으면) 안전하게
// OpenRouter로 폴백한다 — 봇 라우트가 실수로 배포돼도 깨지지 않는다.
export function botModel() {
  const baseURL = process.env.LOCAL_LLM_BASE_URL
  if (baseURL) {
    const provider = createOpenAICompatible({
      name: "codex-lb",
      baseURL,
      apiKey: "unused", // codex-lb는 로컬 호출에 인증을 요구하지 않음(실측 확인됨)
    })
    return provider(process.env.LOCAL_LLM_MODEL || "gpt-5.6-sol")
  }
  return openrouter("anthropic/claude-haiku-4.5")
}

/** 봇 전용 라우트 인증 — 아무나 이 엔드포인트를 때릴 수 없게 공유 토큰을 확인한다
 * (공개 사이트에는 노출되지 않는 라우트지만, 배포됐을 때를 대비한 2차 방어선). */
export function checkBotToken(req: Request): Response | null {
  const expected = process.env.BOT_API_TOKEN
  if (!expected) return new Response("BOT_API_TOKEN not configured", { status: 500 })
  const got = req.headers.get("x-bot-token")
  if (got !== expected) return new Response("unauthorized", { status: 401 })
  return null
}
