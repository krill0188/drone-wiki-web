import Link from "next/link"
import { getNewsFeed, timeAgo, NEWS_TYPE_META } from "@/lib/news"
import NewsCarousel from "@/components/NewsCarousel"
import DroneIcon from "@/components/DroneIcon"

function FeatureCard({
  href,
  emoji,
  eyebrow,
  title,
  desc,
}: {
  href: string
  emoji: string
  eyebrow: string
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 p-6 rounded-2xl border border-line bg-panel hover:border-signal-500 transition-colors overflow-hidden min-h-[230px]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 -bottom-5 text-[130px] leading-none opacity-[0.06] group-hover:opacity-[0.11] transition-opacity select-none"
      >
        {emoji}
      </span>
      <span className="relative text-[13px] text-ink-dim">{eyebrow}</span>
      <span className="relative font-display font-bold text-2xl leading-tight">{title}</span>
      <span className="relative text-[13px] text-ink-dim leading-relaxed flex-1">{desc}</span>
      <span className="relative inline-flex items-center gap-1 self-start px-4 py-1.5 rounded-full border border-line text-[13px] font-medium group-hover:border-signal-500 group-hover:text-signal-600 group-hover:bg-signal-500/10 transition-colors">
        시작하기 →
      </span>
    </Link>
  )
}

export default async function HomePage() {
  const feed = getNewsFeed()
  const latest = feed.slice(0, 16)

  return (
    <div>
      {/* 히어로 — GPT/Gemini처럼 중앙에 크게, 3단계 사용법 안내 */}
      <div className="text-center pt-14 pb-10 px-4 border-b border-line mb-8">
        <DroneIcon className="w-12 h-12 mx-auto mb-3 text-ink" />
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

      <div className="max-w-3xl mx-auto px-4 pb-10">
        {/* 주요 기능 3종 — Liner 스타일: 이럴 때 쓰세요(eyebrow) + 큰 이름 + 시작하기 버튼 */}
        <div className="grid sm:grid-cols-3 gap-3 mb-10">
          <FeatureCard
            href="/chat"
            emoji="💬"
            eyebrow="드론 지식이 궁금할 때"
            title="AI Q&A"
            desc="위키 문서와 지식그래프(GraphRAG)를 근거로 실시간 스트리밍 답변"
          />
          <FeatureCard
            href="/wiki-editor"
            emoji="✍️"
            eyebrow="정리 안 된 메모가 있을 때"
            title="AI 에디터"
            desc="초안을 넣으면 프론트매터·개요·스펙까지 갖춘 문서로 구조화"
          />
          <FeatureCard
            href="/ai-drone-builder"
            emoji="🚀"
            eyebrow="새 드론 프로젝트를 시작할 때"
            title="AI 드론 빌더"
            desc="기획서 → 스펙 → 아키텍처, 3단계 에이전트가 순차로 작성"
          />
        </div>

        {/* 나머지 뉴스는 제목만 슬라이드로 — 전부 더보기(/news)로 들어가서 본다 */}
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-bold text-base">📰 최신 소식</h2>
          <Link href="/news" className="text-[13px] text-signal-600 hover:underline">
            더보기 →
          </Link>
        </div>
        {latest.length > 0 ? (
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
