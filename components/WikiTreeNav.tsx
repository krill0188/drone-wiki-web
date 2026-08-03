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
    <nav className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-700 py-4 px-2 text-sm hidden lg:block">
      <div className="px-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">지식 도메인</div>
      {grouped.map(({ domain, meta, pages: domainPages }) => {
        const isOpen = openDomains.has(domain)
        return (
          <div key={domain} className="mb-0.5">
            <button
              onClick={() => toggle(domain)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left font-medium"
            >
              <span className={`text-[9px] text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              <span>{meta.emoji}</span>
              <span className="flex-1 truncate">{meta.label}</span>
              <span className="text-[11px] text-slate-400">{domainPages.length}</span>
            </button>
            {isOpen && (
              <div className="ml-5 border-l border-slate-200 dark:border-slate-700 pl-2 flex flex-col gap-0.5 mt-0.5 mb-1">
                {domainPages.map((p) => {
                  const active = pathname === `/wiki/${p.slug}`
                  return (
                    <Link
                      key={`${p.layer}-${p.slug}`}
                      href={`/wiki/${p.slug}`}
                      title={p.title}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md truncate text-[13px] ${
                        active
                          ? "bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-medium"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      <span className="text-[11px] shrink-0">{LAYER_ICON[p.layer] ?? "📄"}</span>
                      <span className="truncate">{p.title}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {pages.length === 0 && <div className="px-2 text-xs text-slate-400">불러오는 중...</div>}
    </nav>
  )
}
