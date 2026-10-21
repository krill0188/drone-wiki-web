import Link from "next/link"
import { getNewsFeed, getDailyBriefing, timeAgo, NEWS_TYPE_META } from "@/lib/news"
import NewsCarousel from "@/components/NewsCarousel"
import HeroSection from "@/components/HeroSection"
import AnimatedFeatureCard from "@/components/AnimatedFeatureCard"
import PipelineFlow from "@/components/PipelineFlow"
import StatsSection from "@/components/StatsSection"

export default async function HomePage() {
  const feed = getNewsFeed()
  const latest = feed.slice(0, 16)
  const briefing = getDailyBriefing()

  return (
    <div>
      {/* 히어로 — 애니메이션 클라이언트 컴포넌트 */}
      <HeroSection />

      <div className="max-w-3xl mx-auto px-4 pb-10">
        {/* 기능 카드 3종 — stagger 등장 */}
        <div className="grid sm:grid-cols-3 gap-3 mb-10">
          <AnimatedFeatureCard
            href="/chat"
            emoji="💬"
            eyebrow="드론 지식이 궁금할 때"
            title="AI Q&A"
            desc="위키 문서와 지식그래프(GraphRAG)를 근거로 실시간 스트리밍 답변"
            delay={0}
          />
          <AnimatedFeatureCard
            href="/wiki-editor"
            emoji="✍️"
            eyebrow="정리 안 된 메모가 있을 때"
            title="AI 에디터"
            desc="초안을 넣으면 프론트매터·개요·스펙까지 갖춘 문서로 구조화"
            delay={0.1}
          />
          <AnimatedFeatureCard
            href="/ai-drone-builder"
            emoji="🚀"
            eyebrow="새 드론 프로젝트를 시작할 때"
            title="AI 드론 빌더"
            desc="기획 → HW·SW 스펙 → 기술 스펙 → 아키텍처 → 코드·로드맵, 6단계 에이전트가 순차로 작성"
            delay={0.2}
          />
        </div>

        {/* 2nd Brain 파이프라인 애니메이션 */}
        <PipelineFlow />

        {/* 스탯 카운트업 */}
        <StatsSection />

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
  )
}
