"use client"
import { useEffect, useRef, useState } from "react"

// AI 드론 빌더: 마크다운 복사 → 화면 세션 초기화 안내 팝업 (2026-10-25).
// 최종 승인 · 마감(여기서 종료) · 반려 후 종료 · 새 설계 시작에서 같은 흐름을 쓴다.
//  1) "마크다운을 복사하시겠습니까?" → 복사 버튼  2) 복사 후 "화면 세션을 초기화하면 새 설계를 깨끗한 화면에서 시작할 수 있어요" 안내
export type DialogMode = "final" | "close" | "reject-end" | "manual"

const COPY: Record<DialogMode, { title: string; body: string }> = {
  final: { title: "최종 승인이 끝났어요 — 마크다운을 복사하시겠습니까?", body: "6단계 최종 문서(승인된 단계 전체)를 마크다운으로 클립보드에 복사해요." },
  close: { title: "여기서 종료합니다 — 마크다운을 복사하시겠습니까?", body: "승인된 단계까지의 문서를 마크다운으로 클립보드에 복사해요." },
  "reject-end": { title: "반려하고 종료합니다 — 마크다운을 복사하시겠습니까?", body: "승인된 단계와, 이번에 반려한 단계의 결과(‘반려됨’ 표시)를 함께 복사해요." },
  manual: { title: "새 설계를 시작하시겠습니까?", body: "지금 화면의 입력과 단계 결과가 지워져요. 필요하면 먼저 마크다운을 복사해 두세요." },
}

interface Props {
  mode: DialogMode | null
  onCopy: () => Promise<boolean>
  onReset: () => void
  onClose: () => void
}

export default function BuilderSessionDialog({ mode, onCopy, onReset, onClose }: Props) {
  const [step, setStep] = useState<"ask" | "copied" | "failed">("ask")
  const [busy, setBusy] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => { if (mode) { setStep("ask"); setBusy(false) } }, [mode])
  useEffect(() => { if (mode) primary.current?.focus() }, [mode, step])
  useEffect(() => {
    if (!mode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode, onClose])
  if (!mode) return null

  const c = COPY[mode]
  const doCopy = async () => {
    setBusy(true)
    const ok = await onCopy()
    setBusy(false)
    setStep(ok ? "copied" : "failed")
  }
  const btn = "px-4 py-2 text-sm rounded-lg font-semibold"
  const ghost = `${btn} border border-slate-300 dark:border-slate-600`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="bsd-title" className="w-full max-w-md rounded-xl border-2 border-slate-800 dark:border-slate-300 bg-white dark:bg-slate-900 p-5 shadow-xl">
        {step === "ask" && (
          <>
            <h2 id="bsd-title" className="text-base font-bold mb-2 break-keep">{c.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 break-keep">{c.body}</p>
            <div className="flex flex-wrap gap-2 justify-end">
              {mode === "manual" ? (
                <>
                  <button type="button" onClick={onClose} className={ghost}>취소</button>
                  <button type="button" onClick={onReset} className={ghost}>복사 없이 초기화</button>
                </>
              ) : (
                <button type="button" onClick={onClose} className={ghost}>복사 안 함</button>
              )}
              <button ref={primary} type="button" onClick={doCopy} disabled={busy} className={`${btn} bg-emerald-600 text-white disabled:opacity-50`}>
                {busy ? "복사 중…" : "📋 마크다운 복사"}
              </button>
            </div>
          </>
        )}
        {step === "copied" && (
          <>
            <h2 id="bsd-title" className="text-base font-bold mb-2">복사했어요 ✓</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 break-keep">
              새 설계를 만들려면 <strong>화면 세션을 초기화</strong>해 주세요. 지금 화면의 입력과 단계 결과가 지워지고, 새 컨셉을 깨끗한 화면에서 시작할 수 있어요.
            </p>
            <p className="text-xs text-slate-500 mb-4 break-keep">복사한 문서는 클립보드에 남아 있어요. 초기화는 되돌릴 수 없어요.</p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={onClose} className={ghost}>이 화면 유지</button>
              <button ref={primary} type="button" onClick={onReset} className={`${btn} bg-signal-500 text-white`}>🧹 화면 세션 초기화</button>
            </div>
          </>
        )}
        {step === "failed" && (
          <>
            <h2 id="bsd-title" className="text-base font-bold mb-2">복사하지 못했어요</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 break-keep">브라우저가 클립보드 접근을 막았어요. 화면의 &lsquo;최종 문서&rsquo; 영역에서 직접 선택해 복사한 뒤 초기화해 주세요.</p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={onClose} className={ghost}>이 화면 유지</button>
              <button ref={primary} type="button" onClick={doCopy} className={`${btn} bg-emerald-600 text-white`}>다시 복사</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
