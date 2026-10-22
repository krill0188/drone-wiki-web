// 사용자에게 보이는 글에서 '미확인'이라는 단정적 표기를 '재확인 필요'로 통일한다(2026-10-22 마스터 지시).
// 원본 Markdown(진실의 원천)은 바꾸지 않고, 모델에 보내는 context·화면 표시 단계에서만 적용한다.
// 의미는 같다: 근거를 아직 확인하지 못했으니 다시 확인해야 한다.
export function soften(s: string): string {
  if (!s || !s.includes("미확인")) return s
  return s
    .replace(/미확인입니다/g, "재확인이 필요합니다")
    .replace(/미확인이다/g, "재확인이 필요하다")
    .replace(/미확인이며/g, "재확인이 필요하며")
    .replace(/미확인이고/g, "재확인이 필요하고")
    .replace(/미확인으로/g, "재확인 필요로")
    .replace(/미확인/g, "재확인 필요")
}

// 스트리밍 답변용: 청크 경계에서 '미확인'이 쪼개져도 놓치지 않도록 끝의 '미'·'미확'·'미확인'만 다음 청크까지 붙잡아 둔다.
type Part = { type: string; id?: string; text?: string; [k: string]: unknown }
export function softenTransform(): TransformStream<Part, Part> {
  const held = new Map<string, string>()
  return new TransformStream<Part, Part>({
    transform(part, ctrl) {
      if (part.type === "text-delta" && typeof part.text === "string") {
        const id = part.id ?? ""
        let t = (held.get(id) ?? "") + part.text
        const m = /(미확인[가-힣]{0,2}|미확|미)$/.exec(t)
        const keep = m ? m[1] : ""
        if (keep) t = t.slice(0, -keep.length)
        held.set(id, keep)
        t = soften(t)
        if (t) ctrl.enqueue({ ...part, text: t })
      } else if (part.type === "text-end") {
        const id = part.id ?? ""
        const rest = soften(held.get(id) ?? "")
        if (rest) ctrl.enqueue({ type: "text-delta", id, text: rest })
        held.delete(id)
        ctrl.enqueue(part)
      } else ctrl.enqueue(part)
    },
  })
}
