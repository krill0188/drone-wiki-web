// 브라우저용 Supabase 클라이언트(구글 로그인·내 기록). 공개 가능한 publishable 키만 쓰며, 데이터 접근은 행 수준 보안(RLS)이 막는다.
// NEXT_PUBLIC_AUTH_ENABLED=1일 때만 켜진다(구글 제공자 설정이 끝나기 전에는 로그인 UI를 숨긴다).
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1"
let client: SupabaseClient | null = null

export function sb(): SupabaseClient | null {
  if (!AUTH_ENABLED || typeof window === "undefined") return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY
  if (!url || !key) return null
  client ??= createClient(url, key, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

// 우리 서버 API에 로그인 사용자를 알려 주는 헤더(같은 출처 요청에만 쓴다). 로그인하지 않았으면 빈 객체.
export async function authHeader(): Promise<Record<string, string>> {
  const c = sb()
  if (!c) return {}
  try {
    const { data } = await c.auth.getSession()
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
  } catch { return {} }
}

export const hasConsentCookie = () => typeof document !== "undefined" && /(?:^|; )dw_consent=/.test(document.cookie)
