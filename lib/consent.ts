// 수집 동의(2026-10-25): AI Q&A·AI 드론 빌더 메뉴는 입력 내용을 기능 개선에 쓰는 데 동의해야 쓸 수 있다.
// 모드: strict(기본, 동의 없으면 서버가 403) · optional(동의 없어도 이용, 저장만 안 함) · off(고지·저장 모두 끔).
// 동의 쿠키에는 고지문 버전이 들어가며, 버전이 바뀌면 다시 동의를 받는다. 철회하면 쿠키를 지운다.
import type { NextRequest } from "next/server"

export const CONSENT_COOKIE = "dw_consent"
export const TEST_COOKIE = "dw_test"
export const CONSENT_VERSION = "2026-10-25"
export type ConsentMode = "strict" | "optional" | "off"

export function consentMode(env: Record<string, string | undefined> = process.env): ConsentMode {
  const v = (env.CONSENT_MODE ?? "strict").toLowerCase()
  return v === "optional" || v === "off" ? v : "strict"
}

export function hasConsent(cookies: { get(name: string): { value: string } | undefined }): boolean {
  return cookies.get(CONSENT_COOKIE)?.value === CONSENT_VERSION
}

// 마스터 테스트·운영 점검은 집계에서 뺀다: 쿠키 dw_test=1 또는 헤더 x-dw-test: 1 (비밀이 아니다 — 표시일 뿐 동의를 대신하지 않는다)
export function isTestTraffic(req: NextRequest): boolean {
  return req.cookies.get(TEST_COOKIE)?.value === "1" || req.headers.get("x-dw-test") === "1"
}

// strict 모드에서 동의가 없으면 403 응답을, 아니면 null을 돌려준다.
export function requireConsent(req: NextRequest): Response | null {
  const mode = consentMode()
  if (mode !== "strict") return null
  if (hasConsent(req.cookies)) return null
  return new Response(JSON.stringify({ error: "consent_required", message: "이 메뉴는 입력 내용을 기능 개선에 사용하는 데 동의해야 이용할 수 있습니다." }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}
