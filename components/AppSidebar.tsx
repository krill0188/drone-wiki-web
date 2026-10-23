"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import LangToggle from "@/components/LangToggle"
import DroneIcon from "@/components/DroneIcon"

// 5개 메뉴(2026-10-24 승인): 질문하기 · 설계 도우미 · 자료 탐색(위키·지식그래프·뉴스·에디터) · 근거 센터 · 소개.
// 기존 주소(URL)는 하나도 바꾸지 않고 사이드바 묶음만 바꾼다.
type NavLeaf = { href: string; icon: string; label: string; hint?: string }
type NavGroup = { key: string; icon: string; label: string; href?: string; hint?: string; children?: NavLeaf[] }
const NAV: NavGroup[] = [
  { key: "ask", href: "/chat", icon: "💬", label: "질문하기", hint: "AI Q&A" },
  { key: "design", href: "/ai-drone-builder", icon: "🚀", label: "설계 도우미", hint: "AI 드론 빌더" },
  {
    key: "explore", icon: "📖", label: "자료 탐색",
    children: [
      { href: "/wiki", icon: "📖", label: "위키" },
      { href: "/knowledge", icon: "🕸", label: "지식그래프" },
      { href: "/news", icon: "📰", label: "뉴스" },
      { href: "/wiki-editor", icon: "✍️", label: "AI 에디터" },
    ],
  },
  {
    key: "evidence", icon: "🧾", label: "근거 센터",
    children: [
      { href: "/knowledge-quality", icon: "📊", label: "지식 품질" },
      { href: "/discovery-review", icon: "🔎", label: "추측 지도 검토" },
    ],
  },
  { key: "about", href: "/about", icon: "🧭", label: "소개", hint: "한눈에 보기·운영 상태" },
]
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/")

// GPT/Gemini 스타일 글로벌 좌측 사이드바 — 앱 전체에서 하나만 존재한다.
// 위키 전체 목록은 /wiki 페이지 자체에 도메인 필터와 함께 이미 있으므로
// 사이드바에는 트리를 중복 노출하지 않고 진입 링크만 둔다.
export default function AppSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})

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
              const expanded = open[g.key] ?? childActive
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [g.key]: !expanded }))}
                    aria-expanded={expanded}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors text-left ${
                      childActive ? "text-signal-600" : "hover:bg-paper text-ink"
                    }`}
                  >
                    <span>{g.icon}</span>
                    <span className="flex-1">{g.label}</span>
                    <span className="text-[10px] text-ink-dim">{expanded ? "▾" : "▸"}</span>
                  </button>
                  {expanded && (
                    <div className="ml-4 pl-2 border-l border-line flex flex-col gap-0.5 mt-0.5">
                      {(g.children ?? []).map((c) => {
                        const active = isActive(pathname, c.href)
                        return (
                          <Link
                            key={c.href}
                            href={c.href}
                            onClick={() => setMobileOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                              active ? "bg-signal-500/10 text-signal-600 font-medium" : "hover:bg-paper text-ink"
                            }`}
                          >
                            <span className="text-xs">{c.icon}</span>
                            {c.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-3 border-t border-line shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-hud text-ink-dim">매일 새벽 자동 갱신</span>
          <LangToggle />
        </div>
      </nav>
    </>
  )
}
