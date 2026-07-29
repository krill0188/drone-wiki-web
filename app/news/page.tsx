import Link from "next/link"
import type { Metadata } from "next"
import { getNewsFeed, timeAgo, sourceHost } from "@/lib/news"
import { DOMAIN_META } from "@/lib/types"

export const metadata: Metadata = {
  title: "드론 뉴스 — DroneWiki",
  description: "PX4·ArduPilot 릴리즈, 드론 산업·규제·하드웨어 소식을 매일 자동 수집합니다.",
}

interface Props {
  searchParams: Promise<{ domain?: string; type?: string }>
}

export default async function NewsPage({ searchParams }: Props) {
  const { domain = "", type = "" } = await searchParams
  const all = getNewsFeed()
  const items = all.filter(
    (it) => (!domain || it.domain === domain) && (!type || it.type === type)
  )

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
      active
        ? "bg-cyan-600 border-cyan-600 text-white"
        : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-600"
    }`

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold mb-1">📰 드론 뉴스</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        7개 도메인의 릴리즈·산업·규제 소식 — 매일 새벽 자동 수집
      </p>

      {/* 필터 칩 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        <Link href="/news" className={chip(!domain && !type)}>전체</Link>
        <Link href="/news?type=release" className={chip(type === "release")}>🚀 릴리즈</Link>
        {Object.entries(DOMAIN_META).map(([d, m]) => (
          <Link key={d} href={`/news?domain=${d}`} className={chip(domain === d)}>
            {m.emoji} {m.label}
          </Link>
        ))}
      </div>

      {/* 뉴스 리스트 */}
      <ol className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
        {items.map((it, i) => {
          const meta = DOMAIN_META[it.domain]
          return (
            <li key={it.url} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <div className="flex gap-3">
                <span className="text-xs text-slate-300 dark:text-slate-600 font-mono pt-1 w-6 shrink-0 text-right">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm leading-snug hover:text-cyan-600 dark:hover:text-cyan-400"
                  >
                    {it.type === "release" && <span className="mr-1">🚀</span>}
                    {it.title}
                    <span className="ml-2 text-xs font-normal text-slate-400">({sourceHost(it)})</span>
                  </a>
                  {it.summary && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {it.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                    {meta && (
                      <Link
                        href={`/news?domain=${it.domain}`}
                        className="inline-flex items-center gap-1 hover:underline"
                        style={{ color: meta.color }}
                      >
                        {meta.emoji} {meta.label}
                      </Link>
                    )}
                    <span>·</span>
                    <span>{timeAgo(it.fetched)}</span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {items.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <div className="text-4xl mb-4">📭</div>
          <p>해당 조건의 뉴스가 없습니다</p>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400 text-center">
        총 {all.length}개 수집됨 · 궁금한 내용은{" "}
        <Link href="/chat" className="text-cyan-600 dark:text-cyan-400 hover:underline">AI에게 질문</Link>하세요
      </p>
    </div>
  )
}
