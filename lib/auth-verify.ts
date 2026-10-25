// 서버: 요청의 Authorization Bearer 토큰을 Supabase Auth에 물어 로그인 사용자를 확인한다(2026-10-25).
// 확인된 id만 기록에 붙이므로 클라이언트가 남의 user_id를 사칭할 수 없다. 마스터(OWNER_EMAILS) 계정은 집계에서 제외하는 '테스트'로 표시한다.
import type { NextRequest } from "next/server"

export interface VerifiedUser { id: string; email?: string }
const cache = new Map<string, { at: number; user: VerifiedUser | null }>()

export function ownerEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.OWNER_EMAILS ?? "krill0188@gmail.com").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
}
export const isOwnerEmail = (email?: string | null) => !!email && ownerEmails().includes(email.toLowerCase())

export async function verifyUser(req: NextRequest): Promise<VerifiedUser | null> {
  const h = req.headers.get("authorization")
  const url = process.env.EXP_SUPABASE_URL, key = process.env.EXP_SUPABASE_KEY
  if (!h?.startsWith("Bearer ") || !url || !key) return null
  const token = h.slice(7).trim()
  if (!token || token.length > 4000) return null
  const hit = cache.get(token)
  if (hit && Date.now() - hit.at < 60_000) return hit.user
  let user: VerifiedUser | null = null
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000), cache: "no-store" })
    if (r.ok) { const j = (await r.json()) as { id?: string; email?: string }; if (j.id) user = { id: j.id, email: j.email } }
  } catch { /* 확인 실패는 익명으로 취급 */ }
  cache.set(token, { at: Date.now(), user })
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > 60_000) cache.delete(k)
  return user
}
