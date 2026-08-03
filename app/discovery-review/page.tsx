"use client"

import { useEffect, useState } from "react"
import { useCompletion } from "@ai-sdk/react"

interface RelatedEdge {
  name: string
  type: string
}

interface ReviewItem {
  id: string
  name: string
  ontologyClass: string
  sources: string[]
  outgoing: RelatedEdge[]
  incoming: RelatedEdge[]
}

export default function DiscoveryReviewPage() {
  const [writable, setWritable] = useState<boolean | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [promotedCount, setPromotedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [draftOpen, setDraftOpen] = useState(false)
  const [slug, setSlug] = useState("")
  const [layer, setLayer] = useState<"concepts" | "entities">("concepts")
  const [editableMarkdown, setEditableMarkdown] = useState("")
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { completion, complete, isLoading: draftLoading, error: draftError } = useCompletion({
    api: "/api/discovery/draft",
    onFinish: (_prompt, text) => setEditableMarkdown(text),
  })

  const fetchList = async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const res = await fetch("/api/discovery")
      const data = await res.json()
      setWritable(data.writable)
      setItems(data.pending)
      setPromotedCount(data.promotedCount)
      setRejectedCount(data.rejectedCount)
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

  const closeDraft = () => {
    setDraftOpen(false)
    setActionMsg(null)
    setEditableMarkdown("")
  }

  const openDraft = () => {
    if (!current) return
    setDraftOpen(true)
    setActionMsg(null)
    setEditableMarkdown("")
    setSlug(current.id.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, ""))
    setLayer(current.ontologyClass === "Person" || current.ontologyClass === "Organization" ? "entities" : "concepts")
    complete(current.name, {
      body: {
        nodeId: current.id,
        name: current.name,
        ontologyClass: current.ontologyClass,
        sources: current.sources,
        outgoing: current.outgoing,
        incoming: current.incoming,
      },
    })
  }

  const skip = () => {
    closeDraft()
    setItems((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev))
  }

  const reject = async () => {
    if (!current || busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/discovery/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: current.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg(`⚠️ ${data.error}`)
        return
      }
      setRejectedCount((c) => c + 1)
      closeDraft()
      setItems((prev) => prev.slice(1))
    } finally {
      setBusy(false)
    }
  }

  const promote = async () => {
    if (!current || busy) return
    setBusy(true)
    setActionMsg(null)
    try {
      const res = await fetch("/api/discovery/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: current.id, layer, slug, markdown: editableMarkdown }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg(`⚠️ ${data.error}`)
        return
      }
      setActionMsg(`✅ ${data.path} 저장됨${data.graphUpdateOutput ? " · 그래프 갱신: " + data.graphUpdateOutput.split("\n").slice(-1)[0] : ""}`)
      setPromotedCount((c) => c + 1)
      setItems((prev) => prev.slice(1))
      setDraftOpen(false)
    } finally {
      setBusy(false)
    }
  }

  if (loadingList) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-slate-400">불러오는 중...</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">🔍 Discovery 그래프 승격 검토</h1>
      <p className="text-sm text-slate-500 mb-4">
        raw 원문에서 LLM이 자동 추출한 미검증 개념을 한 건씩 검토해 canonical 위키 문서로 승격합니다.
      </p>

      <div className="flex gap-3 text-xs text-slate-500 mb-6">
        <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">대기 {items.length}</span>
        <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">승격 {promotedCount}</span>
        <span className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">반려 {rejectedCount}</span>
      </div>

      {writable === false && (
        <div className="mb-6 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          ⚠️ 이 도구는 로컬 개발 환경에서만 사용할 수 있습니다(배포된 사이트에서는 위키 문서를 쓸 수 없습니다).
        </div>
      )}
      {listError && <div className="text-sm text-red-600 mb-4">{listError}</div>}

      {!current && !listError && (
        <div className="py-16 text-center text-slate-400">
          <div className="text-4xl mb-4">✅</div>
          <p>검토할 대기 항목이 없습니다.</p>
        </div>
      )}

      {current && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{current.name}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300">
                {current.ontologyClass}
              </span>
            </div>
            {current.sources.length > 0 && (
              <p className="text-xs text-slate-400 mt-1 truncate">📄 {current.sources.join(", ")}</p>
            )}
          </div>

          <div className="p-4 space-y-3">
            {(current.outgoing.length > 0 || current.incoming.length > 0) && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">그래프 관계</p>
                <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  {current.outgoing.map((o, i) => (
                    <span key={`o${i}`}>→ {current.name} --[{o.type}]--&gt; {o.name}</span>
                  ))}
                  {current.incoming.map((inc, i) => (
                    <span key={`i${i}`}>← {inc.name} --[{inc.type}]--&gt; {current.name}</span>
                  ))}
                </div>
              </div>
            )}

            {!draftOpen && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={openDraft}
                  disabled={writable === false || busy}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold"
                >
                  🪄 AI 초안 생성
                </button>
                <button
                  onClick={skip}
                  disabled={busy}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:border-cyan-400"
                >
                  건너뛰기
                </button>
                <button
                  onClick={reject}
                  disabled={writable === false || busy}
                  className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-950"
                >
                  반려
                </button>
              </div>
            )}

            {draftOpen && (
              <div className="space-y-3 pt-1">
                <textarea
                  value={draftLoading ? completion : editableMarkdown}
                  onChange={(e) => setEditableMarkdown(e.target.value)}
                  readOnly={draftLoading}
                  className="w-full min-h-[320px] border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-xs font-mono leading-relaxed bg-slate-50 dark:bg-slate-800 resize-y"
                />
                {draftError && (
                  <div className="text-xs text-red-600">⚠️ {draftError.message}</div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">slug</label>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800 w-56"
                  />
                  <label className="text-xs text-slate-500 ml-2">레이어</label>
                  <select
                    value={layer}
                    onChange={(e) => setLayer(e.target.value as "concepts" | "entities")}
                    className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800"
                  >
                    <option value="concepts">concepts</option>
                    <option value="entities">entities</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={promote}
                    disabled={draftLoading || busy || !editableMarkdown.trim() || !slug.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold"
                  >
                    ✅ 승격 확정
                  </button>
                  <button
                    onClick={closeDraft}
                    disabled={busy}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:border-cyan-400"
                  >
                    취소
                  </button>
                </div>

                {actionMsg && <div className="text-xs text-slate-600 dark:text-slate-300">{actionMsg}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
