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
                className="text-[15px] leading-snug hover:text-signal-600"
              >
                {it.title}
                <span className="ml-1.5 text-xs text-slate-400">({sourceHost(it)})</span>
              </a>
              {it.summary_ko && (
                <p className="text-[13px] text-slate-500 mt-0.5 line-clamp-1 leading-relaxed">
                  {it.summary_ko}
                </p>
              )}
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
    <div className="max-w-3xl mx-auto px-4 py-6">
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
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-signal-500/100 hover:bg-signal-500/10 transition-colors"
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
          <li key={p.slug} className="flex items-baseline gap-2 py-2 border-b border-slate-100">
            <span className="shrink-0">{DOMAIN_META[p.domain]?.emoji || "📄"}</span>
            <Link
              href={`/wiki/${p.slug}`}
              className="text-[15px] leading-snug hover:text-signal-600 min-w-0 truncate"
            >
              {p.title}
            </Link>
            <span className="ml-auto text-xs text-slate-400 shrink-0">{p.updated}</span>
          </li>
        ))}
      </ul>

      {/* 바로가기 */}
      <div className="mt-8 text-[13px] text-slate-500">
        <Link href="/graph" className="text-signal-600 hover:underline">🔵 지식 그래프 탐색</Link>
        <span className="mx-2 text-slate-300">·</span>
        <Link href="/chat" className="text-signal-600 hover:underline">💬 AI Q&amp;A</Link>
      </div>
    </div>
  )
}
