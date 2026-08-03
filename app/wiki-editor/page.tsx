"use client"

import { useState } from "react"
import { useCompletion } from "@ai-sdk/react"

export default function WikiEditorPage() {
  const [draft, setDraft] = useState("")
  const [copied, setCopied] = useState(false)
  const { completion, complete, isLoading, error, stop } = useCompletion({
    api: "/api/wiki-editor",
  })

  const generate = () => {
    if (!draft.trim() || isLoading) return
    complete(draft)
  }

  const copy = async () => {
    if (!completion) return
    await navigator.clipboard.writeText(completion)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">✍️ AI 위키 에디터</h1>
      <p className="text-sm text-slate-500 mb-6">
        정리되지 않은 초안을 입력하면 DroneWiki 톤앤매너와 포맷(frontmatter · 개요 · 스펙 · 활용처 등)에 맞춘
        구조화된 문서 초안을 실시간으로 생성합니다.
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">초안</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: Holybro Pixhawk 6X는 STM32H7 기반 FC고 IMU가 3중화, CAN 버스 지원, GPS는 M9N 씀..."
            className="flex-1 min-h-[360px] border border-slate-300 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={!draft.trim() || isLoading}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              {isLoading ? "정제 중..." : "🪄 AI로 정제"}
            </button>
            {isLoading && (
              <button
                onClick={stop}
                className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm hover:border-cyan-400"
              >
                중단
              </button>
            )}
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              ⚠️ {error.message || "오류가 발생했습니다."}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              위키 문서 초안 (마크다운)
            </label>
            {completion && (
              <button onClick={copy} className="text-xs text-cyan-600 hover:underline">
                {copied ? "복사됨 ✓" : "복사"}
              </button>
            )}
          </div>
          <pre className="flex-1 min-h-[360px] whitespace-pre-wrap break-words border border-slate-300 dark:border-slate-600 rounded-xl p-3 text-xs leading-relaxed bg-slate-50 dark:bg-slate-800 overflow-y-auto font-mono">
            {completion || "결과가 여기에 표시됩니다"}
          </pre>
        </div>
      </div>
    </div>
  )
}
