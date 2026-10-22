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
