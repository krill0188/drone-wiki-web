"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { DOMAIN_META, type Domain } from "@/lib/types"

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

// UnivAI 스타일 좌측 트리뷰 — 도메인(비행제어/통신/하드웨어/GCS/운용/법규/AI자율)을
// 최상위로, 그 아래 실제 위키 문서를 계층으로 보여준다. /api/pages(이미 존재하는
// 엔드포인트)를 재사용해 데이터를 가져온다.
export default function WikiTreeNav() {
  const pathname = usePathname()
  const [pages, setPages] = useState<TreePage[]>([])
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => r.json())
      .then((data: TreePage[]) => setPages(data))
      .catch(() => setPages([]))
  }, [])

  // 현재 보고 있는 문서의 도메인을 기본으로 펼쳐둔다(최초 1회만).
  useEffect(() => {
    if (initialized || pages.length === 0) return
    const activeSlug = pathname?.split("/wiki/")[1]
    const active = pages.find((p) => p.slug === activeSlug)
    setOpenDomains(new Set(active ? [active.domain] : []))
    setInitialized(true)
  }, [pages, pathname, initialized])

  const toggle = (d: string) => {
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
    <nav className="w-64 shrink-0 border-r border-line bg-panel py-4 px-2.5 text-sm hidden lg:block">
      <div className="px-2 mb-3 text-[11px] font-hud font-semibold text-ink-dim uppercase tracking-[0.12em]">
        지식 도메인
      </div>
      {grouped.map(({ domain, meta, pages: domainPages }) => {
        const isOpen = openDomains.has(domain)
        return (
          <div key={domain} className="mb-0.5">
            <button
              onClick={() => toggle(domain)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-paper text-left font-display font-medium text-ink"
            >
              <span className={`text-[8px] text-ink-dim transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}>▶</span>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: meta.color }}
                aria-hidden
              />
              <span className="flex-1 truncate">{meta.label}</span>
              <span className="text-[10px] font-hud text-ink-dim tabular-nums">{String(domainPages.length).padStart(2, "0")}</span>
            </button>
            {isOpen && (
              <div className="ml-[19px] border-l border-line pl-2.5 flex flex-col gap-0.5 mt-0.5 mb-1.5">
                {domainPages.map((p) => {
                  const active = pathname === `/wiki/${p.slug}`
                  return (
                    <Link
                      key={`${p.layer}-${p.slug}`}
                      href={`/wiki/${p.slug}`}
                      title={p.title}
                      className={`relative flex items-center gap-1.5 px-2 py-1 rounded-md truncate text-[13px] transition-colors ${
                        active
                          ? "bg-signal-500/10 text-signal-600 font-medium"
                          : "hover:bg-paper text-ink-dim hover:text-ink"
                      }`}
                    >
                      {active && <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-[3px] h-3.5 rounded-full bg-signal-500" />}
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
      {pages.length === 0 && <div className="px-2 text-xs font-hud text-ink-dim">불러오는 중...</div>}
    </nav>
  )
}
