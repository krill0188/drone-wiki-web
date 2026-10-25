"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { AUTH_ENABLED, sb } from "@/lib/supabase-browser"

// 사이드바 하단 구글 로그인(2026-10-25). 로그인하면 질문·설계 기록을 기기 간에 이어서 볼 수 있다. 로그인은 선택이다.
export default function AuthButton() {
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const c = AUTH_ENABLED ? sb() : null

  useEffect(() => {
    if (!c) return
    c.auth.getSession().then(({ data }) => { setEmail(data.session?.user.email ?? null); setReady(true) })
    const { data: sub } = c.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null))
    return () => sub.subscription.unsubscribe()
  }, [c])

  if (!c) return null
  const login = () => c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } })
  const logout = async () => { await c.auth.signOut(); setEmail(null) }
  const btn = "text-[12px] px-2.5 py-1 rounded-md border border-line hover:bg-paper"

  return (
    <div className="px-3 py-2 border-t border-line text-[12px]">
      {!ready ? null : email ? (
        <div className="flex flex-col gap-1.5">
          <span className="truncate text-ink-dim" title={email}>👤 {email}</span>
          <div className="flex gap-1.5">
            <Link href="/my" className={btn}>내 기록</Link>
            <button type="button" onClick={logout} className={btn}>로그아웃</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={login} className={`${btn} font-semibold`}>🔐 구글로 로그인</button>
          <span className="text-[10.5px] text-ink-dim leading-snug">로그인하면 이전 질문·설계를 기기 간에 이어서 볼 수 있어요(선택)</span>
        </div>
      )}
    </div>
  )
}
