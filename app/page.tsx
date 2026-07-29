import Link from "next/link"
import { getAllPages } from "@/lib/wiki"
import { getNewsFeed, timeAgo, sourceHost, NEWS_TYPE_META } from "@/lib/news"
import { DOMAIN_META } from "@/lib/types"

export default async function HomePage() {
  const pages = await getAllPages()
  const news = getNewsFeed().slice(0, 15)
  const domainCounts = pages.reduce<Record<string, number>>((acc, p) => {
    if (p.domain) acc[p.domain] = (acc[p.domain] || 0) + 1
    return acc
  }, {})
  const recent = [...pages]
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 8)

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      {/* 도메인 인덱스 */}
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
        {Object.entries(DOMAIN_META).map(([d, m], i) => (
          <span key={d}>
            {i > 0 && <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>}
            <Link href={`/wiki?domain=${d}`} className="hover:underline whitespace-nowrap">
              {m.emoji} {m.label}
              <span className="text-slate-400"> {domainCounts[d] || 0}</span>
            </Link>
          </span>
        ))}
      </p>

      {/* 최신 뉴스 */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-bold text-[15px]">최신 소식</h2>
        <Link href="/news" className="text-[13px] text-cyan-700 dark:text-cyan-400 hover:underline">
          더보기 →
        </Link>
      </div>
      <ol className="mb-8">
        {news.map((it, i) => {
          const tmeta = NEWS_TYPE_META[it.type] || NEWS_TYPE_META.news
          return (
            <li key={it.url} className="flex gap-2 py-[7px] border-b border-slate-100 dark:border-slate-800">
              <span className="text-[13px] text-slate-400 font-mono w-5 shrink-0 text-right pt-px">
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
                <div className="text-xs text-slate-400 mt-0.5">
                  {tmeta.emoji} {tmeta.label}
                  {it.region === "KR" && " · 🇰🇷"}
                  {" · "}
                  {timeAgo(it.fetched)}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/* 위키 최근 업데이트 */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-bold text-[15px]">위키 최근 업데이트</h2>
        <Link href="/wiki" className="text-[13px] text-cyan-700 dark:text-cyan-400 hover:underline">
          전체 {pages.length}개 →
        </Link>
      </div>
      <ul className="mb-8">
        {recent.map((p) => (
          <li key={p.slug} className="flex items-baseline gap-2 py-[7px] border-b border-slate-100 dark:border-slate-800">
            <span className="shrink-0">{DOMAIN_META[p.domain]?.emoji || "📄"}</span>
            <Link
              href={`/wiki/${p.slug}`}
              className="text-[15px] leading-snug hover:text-cyan-700 dark:hover:text-cyan-400 min-w-0 truncate"
            >
              {p.title}
            </Link>
            <span className="ml-auto text-xs text-slate-400 shrink-0">{p.updated}</span>
          </li>
        ))}
      </ul>

      {/* 바로가기 */}
      <div className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
        <Link href="/chat" className="text-cyan-700 dark:text-cyan-400 hover:underline">💬 AI에게 질문하기</Link>
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        <Link href="/graph" className="text-cyan-700 dark:text-cyan-400 hover:underline">🔵 지식 그래프 탐색</Link>
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        <Link href="/news/cards" className="text-cyan-700 dark:text-cyan-400 hover:underline">🎴 AI 카드뉴스 만들기</Link>
      </div>
    </div>
  )
}
