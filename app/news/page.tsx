import Link from "next/link"
import type { Metadata } from "next"
import { getNewsFeed, timeAgo, sourceHost, NEWS_TYPE_META, type NewsType } from "@/lib/news"
import { DOMAIN_META } from "@/lib/types"

export const metadata: Metadata = {
  title: "드론 뉴스 — DroneWiki",
  description: "드론 뉴스·방산·정부사업·채용 정보를 국내외에서 매일 자동 수집합니다.",
}

interface Props {
  searchParams: Promise<{ domain?: string; type?: string; region?: string }>
}

export default async function NewsPage({ searchParams }: Props) {
  const { domain = "", type = "", region = "" } = await searchParams
  const all = getNewsFeed()
  const items = all.filter((it) => {
    const matchD = !domain || it.domain === domain
    const matchT = !type || it.type === type
    const matchR =
      !region || (region === "KR" ? it.region === "KR" : it.region !== "KR")
    return matchD && matchT && matchR
  })

  const flink = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`whitespace-nowrap hover:underline ${
        active ? "font-bold text-cyan-700 dark:text-cyan-400" : ""
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <h1 className="font-bold text-lg mb-1">드론 뉴스</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        뉴스 · 방산 · 정부사업 · 채용 — 국내외 소식 매일 자동 수집
      </p>

      {/* 필터 (텍스트 링크) */}
      <div className="text-[13px] text-slate-600 dark:text-slate-300 mb-1 flex flex-wrap gap-x-3 gap-y-1">
        {flink("/news", "전체", !domain && !type && !region)}
        {(Object.entries(NEWS_TYPE_META) as [NewsType, { label: string; emoji: string }][]).map(
          ([t, m]) => flink(`/news?type=${t}`, `${m.emoji} ${m.label}`, type === t)
        )}
        {flink("/news?region=KR", "🇰🇷 국내", region === "KR")}
        {flink("/news?region=global", "🌏 해외", region === "global")}
      </div>
      <div className="text-[13px] text-slate-500 dark:text-slate-400 mb-4 flex flex-wrap gap-x-3 gap-y-1 pb-3 border-b border-slate-200 dark:border-slate-700">
        {Object.entries(DOMAIN_META).map(([d, m]) =>
          flink(`/news?domain=${d}`, `${m.emoji} ${m.label}`, domain === d)
        )}
      </div>

      {/* 뉴스 리스트 */}
      <ol>
        {items.map((it, i) => {
          const meta = DOMAIN_META[it.domain]
          const tmeta = NEWS_TYPE_META[it.type] || NEWS_TYPE_META.news
          return (
            <li key={it.url} className="flex gap-2 py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[13px] text-slate-400 font-mono w-6 shrink-0 text-right pt-px">
                {i + 1}.
              </span>
              <div className="min-w-0">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] leading-snug hover:text-cyan-700 dark:hover:text-cyan-400"
                >
                  {it.title}
                  <span className="ml-1.5 text-xs text-slate-400">({sourceHost(it)})</span>
                </a>
                {(it.summary_ko || it.summary) && (
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {it.summary_ko ? <span className="text-slate-600">🇰🇷 {it.summary_ko}</span> : it.summary}
                  </p>
                )}
                <div className="text-xs text-slate-400 mt-1">
                  <Link href={`/news?type=${it.type}`} className="hover:underline">
                    {tmeta.emoji} {tmeta.label}
                  </Link>
                  {it.region && <> · {it.region === "KR" ? "🇰🇷 국내" : "🌏 해외"}</>}
                  {meta && (
                    <>
                      {" · "}
                      <Link href={`/news?domain=${it.domain}`} className="hover:underline" style={{ color: meta.color }}>
                        {meta.label}
                      </Link>
                    </>
                  )}
                  {" · "}
                  {timeAgo(it.fetched)}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {items.length === 0 && (
        <div className="text-center py-16 text-slate-400 text-sm">해당 조건의 소식이 없습니다</div>
      )}

      <p className="mt-5 text-xs text-slate-400">
        총 {all.length}개 수집됨 · 영문 자료는 AI 한글 요약 제공, 원문은 SHA-256 해시로 무결성 보존 · 궁금한 내용은{" "}
        <Link href="/chat" className="text-cyan-700 dark:text-cyan-400 hover:underline">AI에게 질문</Link>하세요
      </p>
    </div>
  )
}
