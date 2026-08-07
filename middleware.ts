import { NextResponse, type NextRequest } from "next/server"

const COOKIE_NAME = "dw_sid"
const ONE_YEAR = 60 * 60 * 24 * 365

// 익명 세션 식별자를 쿠키로 발급한다(2026-08-08, 클라우드 전환 대비 세션/열람이력
// 기능의 식별자 계층). localStorage가 아니라 쿠키를 쓰는 이유: 나중에 로그인을
// 붙일 때 서버(API 라우트)에서도 이 값을 읽어 실계정 user_id에 매핑·이관할 수
// 있어야 하는데, localStorage는 서버로 전송되지 않아 그 경로가 원천적으로 막힌다.
// httpOnly는 의도적으로 끈다 — 민감정보가 아닌 익명 UUID라 클라이언트(lib/session-id.ts)가
// document.cookie로 직접 읽어 localStorage 키로 써야 하기 때문.
export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)) return NextResponse.next()

  const res = NextResponse.next()
  res.cookies.set(COOKIE_NAME, crypto.randomUUID(), {
    maxAge: ONE_YEAR,
    sameSite: "lax",
    path: "/",
  })
  return res
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
}
