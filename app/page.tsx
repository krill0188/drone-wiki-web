import Link from "next/link"
import { getAllPages } from "@/lib/wiki"
import { getNewsFeed, getDailyBriefing, timeAgo, sourceHost, NEWS_TYPE_META, type NewsItem } from "@/lib/news"
import { DOMAIN_META } from "@/lib/types"

function NewsList({ items, showType = true }: { items: NewsItem[]; showType?: boolean }) {
  return (
    <ol>
      {items.map((it, i) => {
        const tmeta = NEWS_TYPE_META[it.type] || NEWS_TYPE_META.news
        return (
          <li key={it.url} className="flex gap-2 py-2 border-b border-slate-100">
            <span className="text-[13px] text-slate-400 font-mono w-5 shrink-0 text-right pt-px">
              {i + 1}.
            </span>
            <div className="min-w-0">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] leading-snug hover:text-cyan-700"
              >
                {it.title}
                <span className="ml-1.5 text-xs text-slate-400">({sourceHost(it)})</span>
              </a>
              <div className="text-xs text-slate-400 mt-0.5">
                {showType && <>{tmeta.emoji} {tmeta.label} · </>}
                {it.region === "KR" ? "🇰🇷 국내" : "🌏 해외"} · {timeAgo(it.fetched)}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function SectionHead({ title, href, more }: { title: string; href: string; more: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1 mt-8">
      <h2 className="font-bold text-base">{title}</h2>
      <Link href={href} className="text-[13px] text-cyan-700 hover:underline">
        {more} →
      </Link>
    </div>
  )
}

export default async function HomePage() {
  const pages = await getAllPages()
  const feed = getNewsFeed()
  const briefing = getDailyBriefing()
  const news = feed.filter((it) => ["news", "release", "defense"].includes(it.type)).slice(0, 5)
  const jobs = feed.filter((it) => it.type === "job").slice(0, 5)
  const gov = feed.filter((it) => it.type === "gov").slice(0, 5)
  const domainCounts = pages.reduce<Record<string, number>>((acc, p) => {
    if (p.domain) acc[p.domain] = (acc[p.domain] || 0) + 1
    return acc
  }, {})
  const recent = [...pages]
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 5)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* 드론 지식 7개 카테고리 */}
      <h2 className="font-bold text-base mb-3">드론 지식 카테고리</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        {Object.entries(DOMAIN_META).map(([domain, meta]) => (
          <Link
            key={domain}
            href={`/wiki?domain=${domain}`}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50 transition-colors"
          >
            <span className="text-lg">{meta.emoji}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight">{meta.label}</span>
              <span className="block text-xs text-slate-400">{domainCounts[domain] || 0}개 문서</span>
            </span>
          </Link>
        ))}
        <Link
          href="/chat"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
        >
          <span className="text-lg">💬</span>
          <span className="text-[13px] font-medium leading-tight">AI에게 질문</span>
        </Link>
      </div>

      {/* 오늘의 뉴스 — AI 2장 요약 */}
      <SectionHead
        title={briefing ? `🗞️ 오늘의 드론 소식 (${briefing.date})` : "📰 최신 소식"}
        href="/news"
        more="전체 뉴스 더보기"
      />
      {briefing ? (
        <div className="space-y-3">
          {briefing.cards.map((c) => (
            <div key={c.title} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="font-semibold text-[15px] mb-1.5">{c.title}</div>
              <p className="text-[14px] text-slate-600 leading-relaxed">{c.body}</p>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            국내·국외 뉴스, 방산, 정부사업, 채용 소식을 AI가 매일 종합 요약합니다
          </p>
        </div>
      ) : (
        <NewsList items={news} />
      )}

      {/* 채용 */}
      {jobs.length > 0 && (
        <>
          <SectionHead title="💼 채용" href="/news?type=job" more="더보기" />
          <NewsList items={jobs} showType={false} />
        </>
      )}

      {/* 정부사업 */}
      {gov.length > 0 && (
        <>
          <SectionHead title="🏛️ 정부사업" href="/news?type=gov" more="더보기" />
          <NewsList items={gov} showType={false} />
        </>
      )}

      {/* 위키 최근 업데이트 */}
      <SectionHead title="📖 위키 최근 업데이트" href="/wiki" more={`전체 ${pages.length}개`} />
      <ul>
        {recent.map((p) => (
          <li key={p.slug} className="flex items-baseline gap-2 py-2 border-b border-slate-100">
            <span className="shrink-0">{DOMAIN_META[p.domain]?.emoji || "📄"}</span>
            <Link
              href={`/wiki/${p.slug}`}
              className="text-[15px] leading-snug hover:text-cyan-700 min-w-0 truncate"
            >
              {p.title}
            </Link>
            <span className="ml-auto text-xs text-slate-400 shrink-0">{p.updated}</span>
          </li>
        ))}
      </ul>

      {/* 바로가기 */}
      <div className="mt-8 text-[13px] text-slate-500">
        <Link href="/graph" className="text-cyan-700 hover:underline">🔵 지식 그래프 탐색</Link>
        <span className="mx-2 text-slate-300">·</span>
        <Link href="/chat" className="text-cyan-700 hover:underline">💬 AI Q&amp;A</Link>
      </div>
    </div>
  )
}
