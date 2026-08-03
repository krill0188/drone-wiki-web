"use client"

import { useEffect, useRef, useState } from "react"
import { useWikiDoc } from "@/components/WikiDocContext"

interface Props {
  containerRef: { current: HTMLElement | null }
  sourceSlug: string
  sourceTitle: string
}

// 신호 표시등(HUD) 콜아웃 — 코너 브래킷(⌐ / ¬)으로 "포착"된 느낌을 주는, 이 사이트만의
// 텍스트 선택 팝업. 선택 영역을 드래그하면 뜨고, "AI에게 질문하기"(우측 챗 패널로
// 전달) / "지식으로 저장하기"(로컬 하이라이트 로그에 저장)를 실행할 수 있다.
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
      setPos({ top: rect.top + window.scrollY - 54, left: rect.left + window.scrollX + rect.width / 2 })
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

  const corner = (pos2: "tl" | "tr" | "bl" | "br") => {
    const base = "absolute w-2 h-2 border-signal-500 pointer-events-none"
    const map: Record<typeof pos2, string> = {
      tl: "top-0 left-0 border-t-2 border-l-2 rounded-tl-[3px]",
      tr: "top-0 right-0 border-t-2 border-r-2 rounded-tr-[3px]",
      bl: "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-[3px]",
      br: "bottom-0 right-0 border-b-2 border-r-2 rounded-br-[3px]",
    }
    return `${base} ${map[pos2]}`
  }

  return (
    <div
      ref={popupRef}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-50 max-w-[300px]"
      style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}
    >
      <div className="relative bg-panel border border-line rounded-md shadow-xl px-3 pt-2.5 pb-2">
        <span className={corner("tl")} />
        <span className={corner("tr")} />
        <span className={corner("bl")} />
        <span className={corner("br")} />

        <div className="font-hud text-[9px] tracking-[0.14em] text-ink-dim uppercase mb-1.5 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-signal-500 animate-pulse" />
          선택됨 · {selectedText.length}자
        </div>

        <div className="flex items-stretch gap-2">
          <button
            onClick={ask}
            className="px-3 py-1.5 rounded bg-signal-500 hover:bg-signal-600 text-white text-xs font-medium whitespace-nowrap transition-colors"
          >
            AI에게 질문하기
          </button>
          <button
            onClick={save}
            disabled={saveState === "saving"}
            className="px-3 py-1.5 rounded border border-line hover:border-signal-500 hover:text-signal-600 text-ink-dim text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
          >
            {saveState === "saved" ? "저장됨 ✓" : saveState === "error" ? "실패" : saveState === "saving" ? "저장 중…" : "지식으로 저장"}
          </button>
        </div>

        {saveState === "error" && saveError && (
          <div className="mt-1.5 text-[11px] font-hud text-signal-600 leading-snug">{saveError}</div>
        )}
      </div>
    </div>
  )
}
