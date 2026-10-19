import type { GateResult } from "./design-gate"
import { matchProducts } from "./product-match"

// 채팅·봇 Q&A에서도 빌더와 같은 엔진 전제를 쓰도록, 게이트 통과한 멀티로터 설계 질문에
// 판정(<design-gate>)·계산(<design-calc>)·제품 후보(<product-match>)를 한 덩어리로 만든다.
export function designBlocks(gate: GateResult): string {
  if (!gate.block) return ""
  const match = gate.active && gate.complete && gate.spec.platform === "multirotor" ? matchProducts(gate.spec) : null
  const rule = match?.found
    ? "\n[Q&A 규칙] 제품명은 <product-match> 후보 안에서만 추천하고, 후보에 없는 모델을 지어내지 않는다. 수치는 <design-calc>와 모순되면 안 된다."
    : ""
  return [gate.block, gate.calc, match?.block].filter(Boolean).join("\n") + rule
}
