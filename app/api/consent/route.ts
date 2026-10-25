import { NextRequest, NextResponse } from "next/server"
import { CONSENT_COOKIE, CONSENT_VERSION, TEST_COOKIE, consentMode, hasConsent } from "@/lib/consent"

// 수집 동의 상태 조회·동의·철회. 쿠키는 클라이언트가 읽어 팝업 여부를 정하므로 httpOnly를 쓰지 않는다(민감정보 아님).
const ONE_YEAR = 60 * 60 * 24 * 365
const base = { sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" }

export async function GET(req: NextRequest) {
  const res = NextResponse.json({ mode: consentMode(), version: CONSENT_VERSION, agreed: hasConsent(req.cookies) })
  // 마스터 테스트 표시: /api/consent?test=on|off — 집계에서 제외된다(동의를 대신하지 않는다)
  const test = req.nextUrl.searchParams.get("test")
  if (test === "on") res.cookies.set(TEST_COOKIE, "1", { ...base, maxAge: ONE_YEAR })
  if (test === "off") res.cookies.set(TEST_COOKIE, "", { ...base, maxAge: 0 })
  return res
}

export async function POST(req: NextRequest) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string }
  const res = NextResponse.json({ ok: true, action })
  if (action === "agree") res.cookies.set(CONSENT_COOKIE, CONSENT_VERSION, { ...base, maxAge: ONE_YEAR })
  else if (action === "withdraw") res.cookies.set(CONSENT_COOKIE, "", { ...base, maxAge: 0 })
  else return NextResponse.json({ ok: false, error: "action must be agree|withdraw" }, { status: 400 })
  return res
}
