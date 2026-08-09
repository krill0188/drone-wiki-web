// NotebookLM 벤치마킹(2026-08-09): 챗봇 인용을 클릭하면 문서 맨 위가 아니라
// 근거가 된 실제 문단으로 점프하게 한다. 브라우저 네이티브 Text Fragments
// (#:~:text=)를 쓴다 — 별도 하이라이트 JS 없이 크로미움 계열에서 스크롤+
// 하이라이트가 일어난다. 미지원 브라우저에서는 프래그먼트가 조용히 무시되고
// 일반 앵커 이동만 되므로 저하 없이 우아하게 동작한다.
export function buildTextFragmentUrl(path: string, excerpt: string): string {
  const clean = excerpt
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_m, slug, alias) => alias || slug)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/^-\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!clean) return path

  // 매칭 문자열이 길수록 렌더링 시 공백/줄바꿈 차이로 실패하기 쉬우므로 앞부분
  // 짧은 구간만 쓴다 — 전체 문단 일치가 아니라 "첫 등장 지점 포착"이 목적이다.
  const words = clean.split(" ").slice(0, 12).join(" ")
  if (!words) return path
  return `${path}#:~:text=${encodeURIComponent(words)}`
}
