import { notFound } from "next/navigation"
import Link from "next/link"
import { getAllPages, getPageBySlug } from "@/lib/wiki"
import { DOMAIN_META } from "@/lib/types"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const pages = await getAllPages()
  return pages.map((p) => ({ slug: p.slug }))
}

export default async function WikiDetailPage({ params }: Props) {
  const { slug } = await params
  const page = await getPageBySlug(slug)
  if (!page) notFound()

  const meta = DOMAIN_META[page.domain]
  const allPages = await getAllPages()
  const related = allPages
    .filter((p) => p.slug !== slug && (p.domain === page.domain || page.links.includes(p.slug)))
    .slice(0, 5)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* 빵부스러기 */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-6">
        <Link href="/" className="hover:text-cyan-600">홈</Link>
        <span>›</span>
        <Link href="/wiki" className="hover:text-cyan-600">위키</Link>
        <span>›</span>
        {meta && (
          <>
            <Link href={`/wiki?domain=${page.domain}`} className="hover:text-cyan-600">
              {meta.emoji} {meta.label}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="text-slate-600 dark:text-slate-300">{page.title}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* 본문 */}
        <article className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-4">
            {meta && <span className="text-3xl">{meta.emoji}</span>}
            <div>
              <h1 className="text-2xl font-bold">{page.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                <span>{page.layer}</span>
                {meta && (
                  <span
                    className="px-2 py-0.5 rounded-full text-white"
                    style={{ background: meta.color }}
                  >
                    {meta.label}
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-full ${
                    page.confidence === "high" ? "bg-green-100 text-green-700" :
                    page.confidence === "medium" ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}
                >
                  {page.confidence}
                </span>
                {page.updated && <span>갱신: {page.updated}</span>}
              </div>
            </div>
          </div>

          {page.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-6">
              {page.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div
            className="prose prose-slate dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: page.contentHtml }}
          />

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
            <Link href="/chat" className="inline-block px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl font-semibold transition-colors">
              이 주제로 AI에게 더 질문하기 →
            </Link>
          </div>
        </article>

        {/* 사이드바: 관련 페이지 */}
        {related.length > 0 && (
          <aside className="lg:w-56 shrink-0">
            <h2 className="text-sm font-semibold mb-3 text-slate-500">관련 문서</h2>
            <div className="flex flex-col gap-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/wiki/${r.slug}`}
                  className="text-sm px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-cyan-400 transition-colors"
                >
                  <span className="mr-1">{DOMAIN_META[r.domain]?.emoji || "📄"}</span>
                  {r.title}
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
