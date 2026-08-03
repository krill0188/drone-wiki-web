"use client"

import { useEffect, useRef, useState } from "react"
import { useWikiDoc } from "@/components/WikiDocContext"

interface Props {
  containerRef: { current: HTMLElement | null }
  sourceSlug: string
  sourceTitle: string
}

// Liner 스타일 텍스트 하이라이트 UX — 위키 본문에서 텍스트를 드래그하면 선택 영역
// 위에 플로팅 툴팁이 떠서 "AI에게 질문하기"(우측 챗 패널로 전달) / "지식으로
// 저장하기"(로컬 하이라이트 로그에 저장)를 즉시 실행할 수 있다.
export default function TextSelectionPopup({ containerRef, sourceSlug, sourceTitle }: Props) {
  const { askAboutSelection } = useWikiDoc()
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [selectedText, setSelectedText] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const handleUp = (e: MouseEvent) => {
      // 팝업 자체를 클릭한 경우(버튼 등)는 무시 — 버튼의 onClick이 처리한다.
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return

      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ""
      const container = containerRef.current
      if (!text || !sel || sel.rangeCount === 0 || !container || !container.contains(sel.anchorNode)) {
        setPos(null)
        return
      }

      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setPos(null)
        return
      }

      setSelectedText(text)
      setSaveState("idle")
      setPos({ top: rect.top + window.scrollY - 48, left: rect.left + window.scrollX + rect.width / 2 })
    }

    document.addEventListener("mouseup", handleUp)
    return () => document.removeEventListener("mouseup", handleUp)
  }, [containerRef])

  if (!pos || !selectedText) return null

  const ask = () => {
    askAboutSelection(selectedText)
    setPos(null)
  }

  const save = async () => {
    setSaveState("saving")
    setSaveError(null)
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSlug, sourceTitle, text: selectedText }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSaveError(data?.error ?? "저장에 실패했습니다.")
        setSaveState("error")
        return
      }
      setSaveState("saved")
      setTimeout(() => setPos(null), 900)
    } catch {
      setSaveError("네트워크 오류로 저장하지 못했습니다.")
      setSaveState("error")
    }
  }

  return (
    <div
      ref={popupRef}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 flex flex-col gap-1 bg-slate-900 dark:bg-slate-700 text-white rounded-lg shadow-lg px-1.5 py-1.5 text-xs max-w-[280px]"
      style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}
    >
      <div className="flex gap-1">
        <button onClick={ask} className="px-2.5 py-1.5 rounded-md hover:bg-white/10 whitespace-nowrap">
          🤖 AI에게 질문하기
        </button>
        <div className="w-px bg-white/20" />
        <button onClick={save} disabled={saveState === "saving"} className="px-2.5 py-1.5 rounded-md hover:bg-white/10 whitespace-nowrap disabled:opacity-50">
          {saveState === "saved" ? "✅ 저장됨" : saveState === "error" ? "⚠️ 실패" : saveState === "saving" ? "저장 중..." : "💾 지식으로 저장하기"}
        </button>
      </div>
      {saveState === "error" && saveError && (
        <div className="px-2 pb-1 text-[11px] text-amber-300 leading-snug">{saveError}</div>
      )}
    </div>
  )
}
