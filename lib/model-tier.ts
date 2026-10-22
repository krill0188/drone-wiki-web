import type { Plan } from "./kg-plan"
import type { ModelProfile } from "./ai-model"

// 질문 난이도별 모델 배정(2026-10-22 NIM 효율화).
//  fast = "chat" 체인(nemotron-3.5-lightning 우선, 첫 글자 0.9초) — 근거가 이미 정리된 단순 조회·설명
//  deep = "builder" 체인(nemotron-3-ultra 우선) — 여러 대상 비교·설계·원인 설명처럼 종합이 필요한 질문
// 판정은 서버가 이미 만든 계획(Plan)만 본다. 모델이 바꾸지 않는다.
export type Tier = "fast" | "deep"
const DEEP_Q = /비교|차이|장단점|추천|설계|왜\s|이유|원인|원리|어떻게|trade|\bvs\b|대비|영향|판단|적합|선택|구성/i

export function pickTier(plan: Plan, question: string): Tier {
  if (DEEP_Q.test(question)) return "deep"
  if (plan.entities.length >= 2) return "deep"
  if (plan.basis !== "ontology") return "deep" // 위키 요약·클래스 연결 답변은 발췌를 종합해야 한다
  return "fast"
}

export const profileOf = (t: Tier): ModelProfile => (t === "fast" ? "chat" : "builder")

// 요청 본문의 modelTier(fast|deep)는 측정용 강제 지정. 없으면 환경변수 KG_TIER=auto일 때만 자동 판정, 아니면 기존(deep) 유지.
export function resolveTier(plan: Plan, question: string, forced?: unknown): Tier {
  if (forced === "fast" || forced === "deep") return forced
  return process.env.KG_TIER === "auto" ? pickTier(plan, question) : "deep"
}
