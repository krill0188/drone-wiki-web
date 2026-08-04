"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface SelfUpdateProposal {
  newsUrl: string
  newsTitle: string
  newsSource: string
  newsType: string
  newsDate: string
  slug: string
  docTitle: string
  score: number
  bullet: string
}

// discovery-review(app/discovery-review/page.tsx)와 동일한 큐 방식 검토 UI를
// 자가 갱신 파이프라인(뉴스↔위키 교차 참조)용으로 이식. 차이점: LLM 초안 생성
// 단계가 없다 — 반영될 불릿이 이미 확정돼 있으므로 그대로 보여주고 반영/건너뛰기만 받는다.
export default function SelfUpdateReviewPage() {
  const [writable, setWritable] = useState<boolean | null>(null)
  const [items, setItems] = useState<SelfUpdateProposal[]>([])
  const [appliedCount, setAppliedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchList = async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const res = await fetch("/api/self-update")
      const data = await res.json()
      setWritable(data.writable)
      setItems(data.proposals)
      setAppliedCount(data.appliedCount)
      setSkippedCount(data.skippedCount)
    } catch {
      setListError("목록을 불러오지 못했습니다.")
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const current = items[0]

  // 같은 뉴스에 대해 여러 문서 후보가 제안될 수 있는데, apply/skip 둘 다 서버에서
  // newsUrl 단위로 처리 완료 처리된다(lib/self-update.ts) — 큐에서도 같은 newsUrl을
  // 가진 나머지 후보를 함께 제거해 서버 상태와 동기화된 화면을 유지한다.
  const dropSameNews = (newsUrl: string) => {
    setItems((prev) => prev.filter((it) => it.newsUrl !== newsUrl))
  }

  const apply = async () => {
    if (!current || busy) return
    setBusy(true)
    setActionMsg(null)
    try {
      const res = await fetch("/api/self-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: current }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg(`⚠️ ${data.error}`)
        return
      }
      setActionMsg(`✅ [${current.slug}] 문서에 반영됨`)
      setAppliedCount((c) => c + 1)
      dropSameNews(current.newsUrl)
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    if (!current || busy) return
    setBusy(true)
    setActionMsg(null)
    try {
      const res = await fetch("/api/self-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", newsUrl: current.newsUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg(`⚠️ ${data.error}`)
        return
      }
      setSkippedCount((c) => c + 1)
      dropSameNews(current.newsUrl)
    } finally {
      setBusy(false)
    }
  }

  if (loadingList) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-ink-dim">불러오는 중...</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">📰 자가 갱신 파이프라인 검토</h1>
      <p className="text-sm text-ink-dim mb-4">
        뉴스/논문이 어떤 위키 문서와 엮이는지 한 건씩 검토해 &ldquo;{"## 📰 최근 관련 소식"}&rdquo; 섹션에 반영합니다.
        매일 새벽 04:20 자동 반영되므로, 여기서는 자동 반영 전 미리 보거나 건너뛴 건을 다시 검토할 때 씁니다.
      </p>

      <div className="flex gap-3 text-xs text-ink-dim mb-6">
        <span className="px-2.5 py-1 rounded-full bg-panel border border-line">대기 {items.length}</span>
        <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">반영 {appliedCount}</span>
        <span className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">건너뜀 {skippedCount}</span>
      </div>

      {writable === false && (
        <div className="mb-6 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          ⚠️ 이 도구는 로컬 개발 환경에서만 반영할 수 있습니다(배포된 사이트에서는 위키 문서를 쓸 수 없습니다). 목록 확인은 가능합니다.
        </div>
      )}
      {listError && <div className="text-sm text-red-600 mb-4">{listError}</div>}

      {!current && !listError && (
        <div className="py-16 text-center text-ink-dim">
          <div className="text-4xl mb-4">✅</div>
          <p>검토할 대기 항목이 없습니다(모든 뉴스가 이미 처리됐거나 관련 문서를 찾지 못함).</p>
        </div>
      )}

      {current && (
        <div className="border border-line rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-panel border-b border-line">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-signal-500/10 text-signal-600">
                {current.newsType}
              </span>
              <span className="text-xs text-ink-dim">{current.newsSource}{current.newsDate ? ` · ${current.newsDate}` : ""}</span>
            </div>
            <h2 className="text-base font-semibold mt-1">
              <a href={current.newsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-signal-600 hover:underline">
                {current.newsTitle}
              </a>
            </h2>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-ink-dim mb-1.5">연결될 위키 문서 (score={current.score.toFixed(2)})</p>
              <Link href={`/wiki/${current.slug}`} target="_blank" className="text-sm font-medium text-signal-600 hover:underline">
                📄 {current.docTitle}
              </Link>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-dim mb-1.5">추가될 내용 미리보기</p>
              <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed bg-paper border border-line rounded-lg p-3">
{`## 📰 최근 관련 소식\n${current.bullet}`}
              </pre>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={apply}
                disabled={writable === false || busy}
                className="px-4 py-2 bg-signal-500 hover:bg-signal-500/100 disabled:opacity-40 text-white rounded-lg text-sm font-semibold"
              >
                ✅ 문서에 반영
              </button>
              <button
                onClick={skip}
                disabled={writable === false || busy}
                className="px-4 py-2 border border-line rounded-lg text-sm hover:border-signal-400"
              >
                건너뛰기
              </button>
            </div>

            {actionMsg && <div className="text-xs text-ink-dim">{actionMsg}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
