"use client"
import { useEffect, useState } from "react"

type Health = { ok: boolean; counts?: { documents: number; claims: number; products: number }; checkedAt?: string }

// /api/health를 읽어 쉬운 말로 보여 준다. 실패해도 페이지는 그대로 보인다.
export default function HealthStatus() {
  const [h, setH] = useState<Health | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setH(j))
      .catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [])
  if (err) return <p className="mt-2 text-sm text-ink-dim">상태를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>
  if (!h) return <p className="mt-2 text-sm text-ink-dim">확인 중…</p>
  return (
    <div className="mt-2 text-sm">
      <p className={h.ok ? "text-signal-600 font-medium" : "text-red-600 font-medium"}>{h.ok ? "정상이에요" : "확인이 필요해요"}</p>
      {h.counts && (
        <p className="mt-1 text-ink-dim">
          글 {h.counts.documents.toLocaleString()}쪽 · 출처 붙은 사실 {h.counts.claims.toLocaleString()}줄 · 제품 {h.counts.products.toLocaleString()}개를 담고 있어요.
        </p>
      )}
    </div>
  )
}
