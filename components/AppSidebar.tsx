"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { DOMAIN_META, type Domain } from "@/lib/types"
import LangToggle from "@/components/LangToggle"
import DroneIcon from "@/components/DroneIcon"

interface TreePage {
  slug: string
  title: string
  domain: Domain
  layer: string
}

const LAYER_ICON: Record<string, string> = {
  Concepts: "📄",
  Entities: "🏷️",
  Comparisons: "⚖️",
  Queries: "❓",
}

const NAV_ITEMS = [
  { href: "/chat", icon: "💬", label: "AI Q&A" },
  { href: "/wiki-editor", icon: "✍️", label: "AI 에디터" },
  { href: "/ai-drone-builder", icon: "🚀", label: "AI 드론 빌더" },
  { href: "/news", icon: "📰", label: "뉴스" },
]

// GPT/Gemini 스타일 글로벌 좌측 사이드바 — 앱 전체에서 하나만 존재한다(예전엔
// 상단 헤더 nav + /wiki 전용 WikiTreeNav 둘로 나뉘어 있었는데, 위키 도메인
// 트리를 이 사이드바의 접이식 섹션으로 통합했다). /api/pages를 재사용해 위키
// 트리 데이터를 가져온다.
export default function AppSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pages, setPages] = useState<TreePage[]>([])
  const [wikiOpen, setWikiOpen] = useState(false)
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => r.json())
      .then((data: TreePage[]) => setPages(data))
      .catch(() => setPages([]))
  }, [])

  // 현재 위키 문서를 보고 있으면 해당 도메인을 펼치고 위키 섹션도 열어둔다(최초 1회).
  useEffect(() => {
    if (initialized || pages.length === 0) return
    const activeSlug = pathname?.split("/wiki/")[1]
    const active = pages.find((p) => p.slug === activeSlug)
    if (active) {
      setOpenDomains(new Set([active.domain]))
      setWikiOpen(true)
    } else if (pathname?.startsWith("/wiki")) {
      setWikiOpen(true)
    }
    setInitialized(true)
  }, [pages, pathname, initialized])

  const toggleDomain = (d: string) => {
    setOpenDomains((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  const grouped = (Object.entries(DOMAIN_META) as [Domain, (typeof DOMAIN_META)[Domain]][])
    .map(([domain, meta]) => ({
      domain,
      meta,
      pages: pages.filter((p) => p.domain === domain).sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((g) => g.pages.length > 0)

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
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-medium transition-colors ${
                    active ? "bg-signal-500/10 text-signal-600" : "hover:bg-paper text-ink"
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>

          <button
            onClick={() => setWikiOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-paper font-medium text-ink"
          >
            <span className={`text-[9px] text-ink-dim transition-transform ${wikiOpen ? "rotate-90" : ""}`}>▶</span>
            <span>📖</span>
            <span className="flex-1 text-left">위키</span>
            <span className="text-[10px] font-hud text-ink-dim tabular-nums">{pages.length || ""}</span>
          </button>

          {wikiOpen && (
            <div className="ml-2 mt-1 flex flex-col gap-0.5">
              <Link
                href="/wiki"
                onClick={() => setMobileOpen(false)}
                className="px-2.5 py-1 text-xs text-ink-dim hover:text-signal-600 rounded-md"
              >
                전체 문서 보기 →
              </Link>
              {grouped.map(({ domain, meta, pages: domainPages }) => {
                const isOpen = openDomains.has(domain)
                return (
                  <div key={domain}>
                    <button
                      onClick={() => toggleDomain(domain)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-paper text-left text-[13px]"
                    >
                      <span className={`text-[8px] text-ink-dim transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} aria-hidden />
                      <span className="flex-1 truncate">{meta.label}</span>
                      <span className="text-[10px] font-hud text-ink-dim tabular-nums">
                        {String(domainPages.length).padStart(2, "0")}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="ml-[19px] border-l border-line pl-2 flex flex-col gap-0.5 mt-0.5 mb-1">
                        {domainPages.map((p) => {
                          const active = pathname === `/wiki/${p.slug}`
                          return (
                            <Link
                              key={`${p.layer}-${p.slug}`}
                              href={`/wiki/${p.slug}`}
                              title={p.title}
                              onClick={() => setMobileOpen(false)}
                              className={`relative flex items-center gap-1.5 px-2 py-1 rounded-md truncate text-[12px] transition-colors ${
                                active
                                  ? "bg-signal-500/10 text-signal-600 font-medium"
                                  : "hover:bg-paper text-ink-dim hover:text-ink"
                              }`}
                            >
                              <span className="text-[10px] shrink-0 opacity-70">{LAYER_ICON[p.layer] ?? "📄"}</span>
                              <span className="truncate">{p.title}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-line shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-hud text-ink-dim">매일 새벽 자동 갱신</span>
          <LangToggle />
        </div>
      </nav>
    </>
  )
}
