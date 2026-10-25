"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AUTH_ENABLED, sb } from "@/lib/supabase-browser"

// 내 기록(2026-10-25): 구글로 로그인한 사용자가 자기 질문·완성 설계를 다시 보고 지울 수 있다. 행 수준 보안(RLS)으로 본인 행만 보인다.
type Turn = { id: string; feature: string; question: string; status: string; created_at: string }
type Case = { id: string; concept: string; outcome: string; gate_summary: { fail?: number; review?: number; pass?: number }; approved_stages: string[]; created_at: string; markdown_gz_b64: string }
const TAB = ["질문 기록", "설계 사례", "계정"] as const
const FEATURE: Record<string, string> = { chat: "질문하기", "drone-builder": "설계 도우미" }
const OUTCOME: Record<string, string> = { final: "최종 승인", closed: "마감(중간 종료)", rejected_end: "반려 후 종료" }
const STATUS: Record<string, string> = { answered: "답변함", insufficient_evidence: "근거 부족", design_gate_ask: "입력 보완 요청" }

async function gunzipB64(b64: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
}
const fmt = (s: string) => new Date(s).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })

export default function MyPage() {
  const c = AUTH_ENABLED ? sb() : null
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<(typeof TAB)[number]>("질문 기록")
  const [turns, setTurns] = useState<Turn[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [open, setOpen] = useState<{ id: string; md: string } | null>(null)
  const [msg, setMsg] = useState("")
  const [confirm, setConfirm] = useState<"" | "history" | "account">("")

  const load = useCallback(async () => {
    if (!c) return
    const t = await c.from("exp_turns").select("id,feature,question,status,created_at").order("created_at", { ascending: false }).limit(200)
    setTurns((t.data as Turn[]) ?? [])
    const k = await c.from("exp_design_cases").select("id,concept,outcome,gate_summary,approved_stages,created_at,markdown_gz_b64").order("created_at", { ascending: false }).limit(100)
    setCases((k.data as Case[]) ?? [])
  }, [c])

  useEffect(() => {
    if (!c) { setReady(true); return }
    c.auth.getSession().then(({ data }) => { setEmail(data.session?.user.email ?? null); setReady(true); if (data.session) load() })
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => { setEmail(s?.user.email ?? null); if (s) load() })
    return () => sub.subscription.unsubscribe()
  }, [c, load])

  const wrap = "max-w-4xl mx-auto px-4 py-8"
  if (!AUTH_ENABLED) return <div className={wrap}><h1 className="text-xl font-bold mb-2">내 기록</h1><p className="text-sm text-slate-500">로그인 기능은 아직 준비 중이에요.</p></div>
  if (!ready) return <div className={wrap}><p className="text-sm text-slate-500">확인 중…</p></div>
  if (!c || !email) {
    return (
      <div className={wrap}>
        <h1 className="text-xl font-bold mb-2">내 기록</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 break-keep">구글로 로그인하면 이전에 한 질문과 완성한 설계를 다시 보고, 다른 기기에서 이어서 볼 수 있어요. 로그인은 선택이고, 로그인 없이도 메뉴를 쓸 수 있어요.</p>
        <button type="button" disabled={!c} onClick={() => c?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } })} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50">🔐 구글로 로그인</button>
      </div>
    )
  }

  const show = async (k: Case) => { setOpen(open?.id === k.id ? null : { id: k.id, md: await gunzipB64(k.markdown_gz_b64) }) }
  const copy = async (md: string) => { try { await navigator.clipboard.writeText(md); setMsg("복사했어요 ✓") } catch { setMsg("복사하지 못했어요. 직접 선택해 복사해 주세요.") } }
  const delCase = async (id: string) => { await c.from("exp_design_cases").delete().eq("id", id); setCases((x) => x.filter((y) => y.id !== id)); if (open?.id === id) setOpen(null) }
  const delHistory = async () => { const r = await c.rpc("delete_my_history"); setMsg(r.error ? "삭제하지 못했어요." : "내 기록을 모두 삭제했어요."); setConfirm(""); await load() }
  const delAccount = async () => { const r = await c.rpc("delete_my_account"); if (r.error) { setMsg("계정을 삭제하지 못했어요."); return } await c.auth.signOut(); setEmail(null) }
  const withdraw = async () => { await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "withdraw" }) }); setMsg("수집 동의를 철회했어요. 질문하기·설계 도우미는 다시 동의해야 쓸 수 있어요.") }

  const tabBtn = (t: (typeof TAB)[number]) => (
    <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm rounded-lg border ${tab === t ? "border-emerald-600 font-semibold text-emerald-700 dark:text-emerald-400" : "border-slate-300 dark:border-slate-600"}`}>{t}</button>
  )
  return (
    <div className={wrap}>
      <h1 className="text-xl font-bold mb-1">내 기록</h1>
      <p className="text-xs text-slate-500 mb-4">👤 {email} · 기록은 90일 후 자동 삭제돼요. 질문은 개인정보 일부를 가린 형태로 저장돼 있어요.</p>
      <div className="flex gap-2 mb-4" role="tablist">{TAB.map(tabBtn)}</div>
      {msg && <p className="text-xs mb-3 text-emerald-700 dark:text-emerald-400" aria-live="polite">{msg}</p>}

      {tab === "질문 기록" && (
        turns.length === 0 ? <p className="text-sm text-slate-500">저장된 질문이 아직 없어요. 로그인한 상태로 질문하면 여기에 쌓여요.</p> : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl">
            {turns.map((t) => (
              <li key={t.id} className="px-3 py-2 text-sm flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-[11px] text-slate-500 w-28 shrink-0">{fmt(t.created_at)}</span>
                <span className="text-[11px] px-1.5 rounded border border-slate-300 dark:border-slate-600">{FEATURE[t.feature] ?? t.feature}</span>
                <span className="flex-1 min-w-[12rem] break-keep">{t.question}</span>
                <span className="text-[11px] text-slate-500">{STATUS[t.status] ?? t.status}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "설계 사례" && (
        cases.length === 0 ? <p className="text-sm text-slate-500">저장된 설계가 아직 없어요. 로그인한 상태로 설계를 승인하거나 마감하면 여기에 쌓여요.</p> : (
          <ul className="flex flex-col gap-3">
            {cases.map((k) => (
              <li key={k.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong className="break-keep">{k.concept.slice(0, 80)}</strong>
                  <span className="text-[11px] text-slate-500">{fmt(k.created_at)} · {OUTCOME[k.outcome] ?? k.outcome} · {k.approved_stages.length}단계 승인</span>
                  <span className="text-[11px] text-slate-500">게이트 🟢{k.gate_summary.pass ?? 0} 🟡{k.gate_summary.review ?? 0} 🔴{k.gate_summary.fail ?? 0}</span>
                  <span className="ml-auto flex gap-1.5">
                    <button type="button" onClick={() => show(k)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600">{open?.id === k.id ? "접기" : "열기"}</button>
                    <button type="button" onClick={() => delCase(k.id)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600">삭제</button>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">분석 검증(게이트)만 거친 설계이며 실기 비행 검증이 아니에요.</p>
                {open?.id === k.id && (
                  <div className="mt-2">
                    <button type="button" onClick={() => copy(open.md)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 mb-2">마크다운 복사</button>
                    <pre className="p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto bg-slate-50 dark:bg-slate-900 rounded-lg">{open.md}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "계정" && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={async () => { await c.auth.signOut(); setEmail(null) }} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600">로그아웃</button>
            <button type="button" onClick={withdraw} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600">수집 동의 철회</button>
            <Link href="/" className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600">홈으로</Link>
          </div>
          <div className="border border-red-300 dark:border-red-800 rounded-xl p-3 flex flex-col gap-2">
            <strong className="text-red-700 dark:text-red-400">삭제</strong>
            {confirm === "" && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setConfirm("history")} className="px-3 py-1.5 rounded-lg border border-red-400 text-red-700 dark:text-red-400">내 기록 모두 삭제</button>
                <button type="button" onClick={() => setConfirm("account")} className="px-3 py-1.5 rounded-lg border border-red-400 text-red-700 dark:text-red-400">계정과 기록 모두 삭제</button>
              </div>
            )}
            {confirm !== "" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-keep">{confirm === "history" ? "질문·설계·진행 중이던 설계를 모두 지워요." : "계정과 모든 기록을 지워요."} 되돌릴 수 없어요. 계속할까요?</span>
                <button type="button" onClick={confirm === "history" ? delHistory : delAccount} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold">삭제</button>
                <button type="button" onClick={() => setConfirm("")} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600">취소</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
