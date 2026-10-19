import rulesFile from "@/data/ontology/rules.json"

// 공학 규칙의 상수는 data/ontology/rules.json 한 곳에서만 정의한다(근거는 claims.json).
// 규칙이나 상수 이름이 없으면 조용히 기본값을 쓰지 않고 즉시 실패시킨다.
interface RuleRec { id: string; constants?: Record<string, number> }
const RULES = rulesFile.rules as RuleRec[]

export function K(ruleId: string, key: string): number {
  const v = RULES.find((r) => r.id === ruleId)?.constants?.[key]
  if (typeof v !== "number") throw new Error(`rules.json: ${ruleId}.${key} 상수가 없다`)
  return v
}
