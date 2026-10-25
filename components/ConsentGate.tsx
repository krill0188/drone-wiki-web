"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"

// 수집 동의 게이트(2026-10-25): AI 질문하기·AI 드론 빌더 메뉴 진입 시 입력 내용 수집·이용에 동의를 받는다.
// strict(기본): 동의해야 메뉴를 쓸 수 있다(서버도 403) / optional: 거부해도 쓸 수 있으나 저장하지 않는다 / off: 고지 없음.
type State = "checking" | "need" | "agreed" | "declined" | "open"
const NAME = { chat: "AI 질문하기", builder: "AI 드론 빌더" } as const

export default function ConsentGate({ feature, children, compact = false }: { feature: keyof typeof NAME; children: ReactNode; compact?: boolean }) {
  // compact: 우측 질문 패널처럼 좁은 곳에서 쓰는 형태(패널 본문을 대체하고, 동의 후에는 아래 안내 줄 없이 본문만 보인다)
  const wrap = compact ? "flex-1 overflow-y-auto p-3" : "max-w-4xl mx-auto px-4 py-10"
  const [state, setState] = useState<State>("checking")
  const [mode, setMode] = useState<"strict" | "optional" | "off">("strict")
  const [busy, setBusy] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/consent", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { mode: "strict" | "optional" | "off"; agreed: boolean }) => {
        if (!alive) return
        setMode(d.mode)
        setState(d.mode === "off" ? "open" : d.agreed ? "agreed" : "need")
      })
      .catch(() => alive && setState("need"))
    return () => { alive = false }
  }, [])
  useEffect(() => { if (state === "need") primary.current?.focus() }, [state])

  const post = async (action: "agree" | "withdraw") => {
    setBusy(true)
    try { await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }) } finally { setBusy(false) }
  }
  const agree = async () => { await post("agree"); setState("agreed") }
  const withdraw = async () => { await post("withdraw"); setState("need") }

  if (state === "checking") return <div className={`${wrap} text-sm text-slate-500`} aria-live="polite">확인 중…</div>
  if (state === "open") return <>{children}</>
  if (state === "agreed" || (state === "declined" && mode === "optional")) {
    if (compact) return <>{children}</>
    return (
      <>
        {children}
        <div className="max-w-4xl mx-auto px-4 pb-8 text-[11.5px] text-slate-500">
          {state === "agreed" ? <>입력 내용은 이 메뉴의 기능 개선에 사용하며 90일 후 삭제돼요. </> : <>동의하지 않아 입력 내용을 저장하지 않아요. </>}
          <button type="button" onClick={state === "agreed" ? withdraw : () => setState("need")} className="underline underline-offset-2">{state === "agreed" ? "수집 동의 철회" : "동의 내용 보기"}</button>
        </div>
      </>
    )
  }

  const declined = state === "declined"
  return (
    <div className={wrap}>
      {declined && mode === "strict" ? (
        <div className="border-2 border-slate-800 dark:border-slate-300 rounded-xl p-6 text-center">
          <h1 className="text-lg font-bold mb-2">동의하지 않으시면 {NAME[feature]} 메뉴를 사용할 수 없어요</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 break-keep">이 메뉴는 입력한 내용을 기능 개선에 쓰는 것을 전제로 제공돼요. 위키·그래프·뉴스 메뉴는 동의 없이 그대로 쓸 수 있어요.</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/" className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 font-semibold">홈으로</Link>
            <button type="button" onClick={() => setState("need")} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-semibold">동의 내용 다시 보기</button>
          </div>
        </div>
      ) : (
        <div role="dialog" aria-modal="true" aria-labelledby="cg-title" className="border-2 border-slate-800 dark:border-slate-300 rounded-xl p-6 bg-white dark:bg-slate-900">
          <h1 id="cg-title" className="text-lg font-bold mb-3 break-keep">{NAME[feature]} — 입력 내용 수집·이용에 동의하시겠습니까?</h1>
          <p className="text-sm mb-3 break-keep">이 메뉴에 입력한 내용(질문, 설계 조건)은 <strong>해당 메뉴 기능을 업데이트하는 데 사용</strong>합니다. 동의하시면 정상적으로 이용할 수 있어요.</p>
          <dl className={`text-[13px] grid gap-y-1.5 gap-x-3 ${compact ? "" : "sm:grid-cols-[88px_1fr]"} mb-4 text-slate-700 dark:text-slate-300`}>
            <dt className="font-semibold">수집 항목</dt><dd>입력한 질문·설계 조건, 응답 상태(답변 여부·사용 근거 문서), 완성한 설계의 요약, 익명 세션 식별자(쿠키)</dd>
            <dt className="font-semibold">이용 목적</dt><dd>답하지 못한 질문 파악, 답변·설계 검증기 개선, 지식 보강 우선순위 결정</dd>
            <dt className="font-semibold">보관 기간</dt><dd>90일 후 삭제(개인을 식별하지 않는 집계값만 유지)</dd>
            <dt className="font-semibold">주의</dt><dd>이메일·전화번호·주소 등 개인정보나 비밀번호·키는 입력하지 마세요. 저장 전에 일부를 자동으로 가리지만 완전하지 않아요.</dd>
            <dt className="font-semibold">거부·철회</dt><dd>{mode === "strict" ? "동의하지 않으면 이 메뉴를 사용할 수 없어요." : "동의하지 않아도 이용할 수 있고, 이 경우 저장하지 않아요."} 이용 중에도 화면 아래 &lsquo;수집 동의 철회&rsquo;로 언제든 철회할 수 있어요.</dd>
          </dl>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => setState("declined")} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 font-semibold">동의하지 않음</button>
            <button ref={primary} type="button" onClick={agree} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50">동의하고 계속</button>
          </div>
        </div>
      )}
    </div>
  )
}
