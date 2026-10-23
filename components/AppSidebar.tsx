"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import LangToggle from "@/components/LangToggle"
import DroneIcon from "@/components/DroneIcon"
import ThemeSkinControls from "@/components/ThemeSkinControls"
import { NAV, isActive } from "@/lib/nav"

// GPT/Gemini 스타일 글로벌 좌측 사이드바 — 앱 전체에서 하나만 존재한다.
// 위키 전체 목록은 /wiki 페이지 자체에 도메인 필터와 함께 이미 있으므로
// 사이드바에는 트리를 중복 노출하지 않고 진입 링크만 둔다.
export default function AppSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* 모바일 전용 햄버거 토글 */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="메뉴 열기"
        className="lg:hidden fixed top-3 left-3 z-40 w-9 h-9 rounded-lg bg-ink text-white flex items-center justify-center shadow-md"
      >
        ☰
      </button>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      <nav
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-64 shrink-0 border-r border-line bg-panel flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-line shrink-0">
          <Link href="/" className="flex items-center gap-1.5 font-display font-bold text-[15px]" onClick={() => setMobileOpen(false)}>
            <span className="w-1.5 h-1.5 rounded-full bg-signal-500 shadow-[0_0_6px_var(--color-signal-500)]" />
            <DroneIcon className="w-4 h-4" />
            DroneWiki
          </Link>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-ink-dim text-sm">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2.5 text-sm">
          <div className="flex flex-col gap-0.5 mb-4">
            {NAV.map((g) => {
              if (g.href) {
                const active = isActive(pathname, g.href)
                return (
                  <Link
                    key={g.key}
                    href={g.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${
                      active ? "bg-signal-500/10 text-signal-600" : "hover:bg-paper text-ink"
                    }`}
                  >
                    <span>{g.icon}</span>
                    <span className="flex-1">{g.label}</span>
                    {g.hint && <span className="text-[10px] font-hud text-ink-dim">{g.hint}</span>}
                  </Link>
                )
              }
              const childActive = (g.children ?? []).some((c) => isActive(pathname, c.href))
              return (
                <div key={g.key} className="mt-1">
                  <div className={`flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-hud uppercase tracking-wider ${childActive ? "text-signal-600" : "text-ink-dim"}`}>
                    <span>{g.icon}</span>
                    <span className="flex-1">{g.label}</span>
                  </div>
                  <div className="ml-[18px] pl-2 border-l-2 border-line flex flex-col gap-0.5">
                    {(g.children ?? []).map((c) => {
                      const active = isActive(pathname, c.href)
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors ${
                            active ? "bg-signal-500/10 text-signal-600 font-semibold border-l-2 border-signal-500 -ml-[10px] pl-[18px]" : "hover:bg-paper text-ink"
                          }`}
                        >
                          <span className="text-xs">{c.icon}</span>
                          {c.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-3 border-t border-line shrink-0 flex flex-col gap-2.5">
          <ThemeSkinControls />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-hud text-ink-dim">매일 새벽 자동 갱신</span>
            <LangToggle />
          </div>
        </div>
      </nav>
    </>
  )
}
