import Link from "next/link"
import { getNewsFeed, getDailyBriefing, timeAgo, NEWS_TYPE_META } from "@/lib/news"
import NewsCarousel from "@/components/NewsCarousel"
import HomeTop from "@/components/HomeTop"
import PipelineFlow from "@/components/PipelineFlow"
import StatsSection from "@/components/StatsSection"
import ReducedMotion from "@/components/ReducedMotion"
import rulesJson from "@/data/ontology/rules.json"
import qualityJson from "@/data/ontology/quality.json"

export default async function HomePage() {
  const feed = getNewsFeed()
  const latest = feed.slice(0, 16)
  const briefing = getDailyBriefing()
  const ruleRows = (rulesJson as { rules?: { status: string }[] }).rules ?? (rulesJson as unknown as { status: string }[])
  const implementedRules = ruleRows.filter((r) => r.status === "implemented").length
  const wikiDocs = (qualityJson as { counts: { documents: number } }).counts.documents

  return (
    <ReducedMotion>
    <div>
      {/* 홈 윗부분 — 작업실 스킨(기본) 또는 기본 스킨(기존 히어로+기능 카드). 사이드바 스위치로 전환 */}
      <HomeTop docs={wikiDocs} rules={implementedRules} />

      <div className="max-w-3xl mx-auto px-4 pb-10">
        {/* 2nd Brain 파이프라인 애니메이션 */}
        <PipelineFlow />

        {/* 스탯 카운트업 */}
        <StatsSection rules={implementedRules} docs={wikiDocs} />

        {/* 뉴스 */}
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-bold text-base">
            {briefing ? `🗞️ 오늘의 드론 소식 (${briefing.date})` : "📰 최신 소식"}
          </h2>
          <Link href="/news" className="text-[13px] text-signal-600 hover:underline">
            더보기 →
          </Link>
        </div>
        {briefing ? (
          <NewsCarousel>
            {briefing.cards.map((c) => (
              <div
                key={c.title}
                className="snap-start shrink-0 w-[260px] sm:w-[300px] rounded-lg border border-line bg-panel px-4 py-3"
              >
                <div className="font-semibold text-[15px] mb-1.5">{c.title}</div>
                <p className="text-[13px] text-ink-dim leading-relaxed line-clamp-6">{c.body}</p>
              </div>
            ))}
          </NewsCarousel>
        ) : latest.length > 0 ? (
          <NewsCarousel>
            {latest.map((it) => {
              const tmeta = NEWS_TYPE_META[it.type] || NEWS_TYPE_META.news
              return (
                <a
                  key={it.url}
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="snap-start shrink-0 w-[220px] rounded-lg border border-line bg-panel px-3 py-2.5 hover:border-signal-500 transition-colors"
                >
                  <div className="text-[11px] text-ink-dim mb-1">
                    {tmeta.emoji} {tmeta.label} · {timeAgo(it.fetched)}
                  </div>
                  <div className="text-[13px] leading-snug line-clamp-3">{it.title}</div>
                </a>
              )
            })}
          </NewsCarousel>
        ) : (
          <p className="text-[13px] text-ink-dim">아직 수집된 소식이 없습니다.</p>
        )}
      </div>
    </div>
    </ReducedMotion>
  )
}
