"use client"

import { useRef } from "react"

// 뉴스 요약 카드를 세로 목록 대신 가로 슬라이드로 — 스크롤/스와이프 자체는
// CSS scroll-snap이 처리하고, 이 컴포넌트는 데스크톱용 이전/다음 버튼만 더한다.
export default function NewsCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 300, behavior: "smooth" })
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>
      <button
        onClick={() => scroll(-1)}
        aria-label="이전"
        className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-panel border border-line shadow items-center justify-center text-ink-dim hover:text-signal-600 hover:border-signal-500 transition-colors"
      >
        ‹
      </button>
      <button
        onClick={() => scroll(1)}
        aria-label="다음"
        className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-panel border border-line shadow items-center justify-center text-ink-dim hover:text-signal-600 hover:border-signal-500 transition-colors"
      >
        ›
      </button>
    </div>
  )
}
