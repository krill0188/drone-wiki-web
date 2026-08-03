import Link from "next/link"
import { getAllPages } from "@/lib/wiki"
import { getNewsFeed, getDailyBriefing, timeAgo, sourceHost, NEWS_TYPE_META, type NewsItem } from "@/lib/news"
import { DOMAIN_META } from "@/lib/types"
import NewsCarousel from "@/components/NewsCarousel"

function NewsList({ items, showType = true }: { items: NewsItem[]; showType?: boolean }) {
  return (
    <ol>
      {items.map((it, i) => {
        const tmeta = NEWS_TYPE_META[it.type] || NEWS_TYPE_META.news
        return (
          <li key={it.url} className="flex gap-2 py-2 border-b border-line">
            <span className="text-[13px] text-ink-dim font-mono w-5 shrink-0 text-right pt-px">
              {i + 1}.
            </span>
            <div className="min-w-0">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] leading-snug hover:text-signal-600"
              >
                {it.title}
                <span className="ml-1.5 text-xs text-ink-dim">({sourceHost(it)})</span>
              </a>
              {it.summary_ko && (
                <p className="text-[13px] text-ink-dim mt-0.5 line-clamp-1 leading-relaxed">
                  {it.summary_ko}
                </p>
              )}
              <div className="text-xs text-ink-dim mt-0.5">
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

function FeatureCard({
  href,
  emoji,
  title,
  desc,
  cta,
}: {
  href: string
  emoji: string
  title: string
  desc: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 p-4 rounded-xl border border-line bg-panel hover:border-signal-500 transition-colors"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="font-display font-bold text-[15px] leading-snug">{title}</span>
      <span className="text-[13px] text-ink-dim leading-relaxed flex-1">{desc}</span>
      <span className="text-xs font-hud text-signal-600 group-hover:underline">{cta} →</span>
    </Link>
  )
}

function SectionHead({ title, href, more }: { title: string; href: string; more: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1 mt-8">
      <h2 className="font-bold text-base">{title}</h2>
      <Link href={href} className="text-[13px] text-signal-600 hover:underline">
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
  const papers = feed.filter((it) => it.type === "paper").slice(0, 5)
  const videos = feed.filter((it) => it.type === "video").slice(0, 5)
  const domainCounts = pages.reduce<Record<string, number>>((acc, p) => {
    if (p.domain) acc[p.domain] = (acc[p.domain] || 0) + 1
    return acc
  }, {})
  const recent = [...pages]
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 5)

  return (
    <div>
      {/* 히어로 — GPT/Gemini처럼 중앙에 크게, 3단계 사용법 안내 */}
      <div className="text-center pt-14 pb-10 px-4 border-b border-line mb-8">
        <div className="text-5xl mb-3">🛸</div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-2">DroneWiki</h1>
        <p className="text-ink-dim text-sm sm:text-[15px] mb-7">
          드론 비행제어·통신·하드웨어·GCS·법규·AI 자율 — 모든 드론 지식을 AI와 함께
        </p>
        <div className="flex flex-col gap-2.5 max-w-sm mx-auto text-left text-[13px]">
          <div className="flex items-start gap-2.5">
            <span className="font-hud text-signal-600 shrink-0 mt-px">01</span>
            <span className="text-ink-dim">왼쪽 사이드바의 <strong className="text-ink">AI Q&amp;A</strong>로 바로 질문하세요</span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="font-hud text-signal-600 shrink-0 mt-px">02</span>
            <span className="text-ink-dim"><strong className="text-ink">위키</strong> 문서를 읽다가 텍스트를 선택하면 그 자리에서 질문·저장</span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="font-hud text-signal-600 shrink-0 mt-px">03</span>
            <span className="text-ink-dim"><strong className="text-ink">AI 드론 빌더</strong>에 컨셉 한 줄로 프로젝트 전체를 설계</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-6">
      {/* AI 기능 소개 — 각 도구가 실제로 뭘 해주는지 한 줄씩 설명 */}
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <FeatureCard
          href="/chat"
          emoji="💬"
          title="드론 지식, 대화로 바로"
          desc="위키 문서와 지식그래프(GraphRAG)를 근거로 실시간 스트리밍 답변"
          cta="AI에게 질문하기"
        />
        <FeatureCard
          href="/wiki-editor"
          emoji="✍️"
          title="정리 안 된 메모를 위키 문서로"
          desc="초안을 넣으면 프론트매터·개요·스펙까지 갖춘 문서로 구조화"
          cta="AI 에디터 열기"
        />
        <FeatureCard
          href="/ai-drone-builder"
          emoji="🚀"
          title="컨셉 한 줄로 프로젝트 설계"
          desc="기획서 → 스펙 → 아키텍처, 3단계 에이전트가 순차로 작성"
          cta="AI 드론 빌더 열기"
        />
      </div>

      {/* 드론 지식 7개 카테고리 */}
      <h2 className="font-bold text-base mb-3">드론 지식 카테고리</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        {Object.entries(DOMAIN_META).map(([domain, meta]) => (
          <Link
            key={domain}
            href={`/wiki?domain=${domain}`}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-line hover:border-signal-500/100 hover:bg-signal-500/10 transition-colors"
          >
            <span className="text-lg">{meta.emoji}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight">{meta.label}</span>
              <span className="block text-xs text-ink-dim">{domainCounts[domain] || 0}개 문서</span>
            </span>
          </Link>
        ))}
        <Link
          href="/chat"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-signal-500 bg-signal-500 text-white hover:bg-signal-500/100 transition-colors"
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
        <div>
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
          <p className="text-xs text-ink-dim mt-2">
            국내·국외 뉴스, 방산, 정부사업, 채용 소식을 AI가 매일 종합 요약합니다 · 옆으로 넘겨보세요
          </p>
        </div>
      ) : (
        <NewsList items={news} />
      )}

      {/* 논문 */}
      {papers.length > 0 && (
        <>
          <SectionHead title="📄 최신 논문" href="/news?type=paper" more="더보기" />
          <NewsList items={papers} showType={false} />
        </>
      )}

      {/* 영상 */}
      {videos.length > 0 && (
        <>
          <SectionHead title="🎬 기술 영상 (검증 채널)" href="/news?type=video" more="더보기" />
          <NewsList items={videos} showType={false} />
        </>
      )}

      {/* 정부사업 */}
      {gov.length > 0 && (
        <>
          <SectionHead title="🏛️ 정부사업" href="/news?type=gov" more="더보기" />
          <NewsList items={gov} showType={false} />
        </>
      )}

      {/* 채용 */}
      {jobs.length > 0 && (
        <>
          <SectionHead title="💼 채용" href="/news?type=job" more="더보기" />
          <NewsList items={jobs} showType={false} />
        </>
      )}

      {/* 위키 최근 업데이트 */}
      <SectionHead title="📖 위키 최근 업데이트" href="/wiki" more={`전체 ${pages.length}개`} />
      <ul>
        {recent.map((p) => (
          <li key={p.slug} className="flex items-baseline gap-2 py-2 border-b border-line">
            <span className="shrink-0">{DOMAIN_META[p.domain]?.emoji || "📄"}</span>
            <Link
              href={`/wiki/${p.slug}`}
              className="text-[15px] leading-snug hover:text-signal-600 min-w-0 truncate"
            >
              {p.title}
            </Link>
            <span className="ml-auto text-xs text-ink-dim shrink-0">{p.updated}</span>
          </li>
        ))}
      </ul>

      {/* 바로가기 */}
      <div className="mt-8 text-[13px] text-ink-dim">
        <Link href="/graph" className="text-signal-600 hover:underline">🔵 지식 그래프 탐색</Link>
      </div>
      </div>
    </div>
  )
}
