"use client"
import { useEffect, useState } from "react"
import MarkdownText from "./MarkdownText"

// 라벨된 일반 공학 설명 블록(KG_GENERAL=1, 설계: docs/ai-qa-improvement-plan.md §3).
// 근거 기반 본문이 끝난 뒤 별도 엔드포인트로 요청하며, 본문과 시각적으로 구분한다(점선 테두리·상시 라벨).
// 서버가 자격을 다시 판정해 skipped/rejected를 돌려주면 아무것도 그리지 않는다(본문은 영향 없음).
const cache = new Map<string, string | null>() // 같은 질문 재요청 방지(세션 복원·재렌더)

export default function GeneralTierBlock({ question }: { question: string }) {
  const [text, setText] = useState<string | null | undefined>(cache.get(question))
  useEffect(() => {
    if (!question || cache.has(question)) return
    const ac = new AbortController()
    fetch("/api/general-tier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }), signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { status: "skipped" }))
      .then((d: { status?: string; text?: string }) => {
        const t = d.status === "shown" && typeof d.text === "string" ? d.text : null
        cache.set(question, t); setText(t)
      })
      .catch(() => { if (!ac.signal.aborted) { cache.set(question, null); setText(null) } })
    return () => ac.abort()
  }, [question])
  if (text === undefined) return <p className="px-1 text-[11px] text-ink-dim" role="status" aria-live="polite">일반 공학 설명을 준비하는 중…</p>
  if (!text) return null
  return (
    <section aria-label="일반 공학 설명 (위키·지식그래프 근거 아님)" className="rounded-xl border border-dashed border-line px-3 py-2 text-[13px] leading-relaxed text-ink-dim">
      <MarkdownText text={text} />
    </section>
  )
}
