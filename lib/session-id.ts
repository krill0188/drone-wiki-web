const COOKIE_NAME = "dw_sid"

/**
 * middleware.ts가 발급한 익명 세션 쿠키를 읽는다. 클라이언트 컴포넌트에서만
 * 호출한다(document 필요, "use client" 내부에서만 사용). 쿠키가 아직 없는 극히
 * 드문 레이스(미들웨어 미실행 등)면 빈 문자열을 반환하며, 호출부는 빈 문자열이면
 * 저장을 건너뛰도록 방어한다(session-store.ts 참고).
 */
export function getSessionId(): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : ""
}
