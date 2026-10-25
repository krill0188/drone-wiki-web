// 저장 전 마스킹(2026-10-25): 로그인 없이도 자유 입력에 이메일·전화번호·키·토큰이 섞일 수 있어 서버가 저장 직전에 가린다.
// 완전한 개인정보 탐지가 아니라 '최소 마스킹'이다 — 입력창 고지에서도 개인정보를 쓰지 말라고 안내한다.
const RULES: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]"],
  [/\b\d{6}[-\s]?[1-8]\d{6}\b/g, "[주민번호]"], // 주민등록번호 형태
  [/(?<![\d])(?:\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/g, "[전화번호]"], // 휴대전화
  [/(?<![\d])0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}(?!\d)/g, "[전화번호]"], // 일반 전화(구분자 있는 형태)
  [/\b(?:\d[ -]?){13,19}\b/g, "[카드/계좌번호]"],
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|nvapi-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g, "[키/토큰]"],
  [/(?<=[?&](?:token|key|apikey|api_key|access_token|secret|password|pwd|sig|signature)=)[^&\s]+/gi, "[비밀값]"],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g, "[인증정보]"],
  [/(?<![A-Za-z0-9])[A-Fa-f0-9]{32,}(?![A-Za-z0-9])/g, "[긴 해시/키]"],
]

export function maskText(input: string, maxLen = 2000): string {
  let s = String(input ?? "").slice(0, maxLen * 2)
  for (const [re, rep] of RULES) s = s.replace(re, rep)
  s = s.replace(/\s+/g, " ").trim()
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
}
