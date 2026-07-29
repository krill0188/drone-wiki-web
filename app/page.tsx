import Link from "next/link"
import { getAllPages } from "@/lib/wiki"
import { DOMAIN_META } from "@/lib/types"

export default async function HomePage() {
  const pages = await getAllPages()
  const domainCounts = pages.reduce<Record<string, number>>((acc, p) => {
    if (p.domain) acc[p.domain] = (acc[p.domain] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      {/* Hero */}
      <section style={{ background: "linear-gradient(to bottom, #0f172a, #1e293b)", color: "#fff", padding: "6rem 1rem" }}>
        <div style={{ maxWidth: "48rem", margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "#22d3ee", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.5rem" }}>
            <span>🛸</span> 드론 특화 AI 지식 플랫폼
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, lineHeight: 1.2, marginBottom: "1.5rem" }}>
            드론에 관한 모든 질문,<br />
            <span style={{ color: "#22d3ee" }}>여기서 해결됩니다</span>
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1.1rem", marginBottom: "2.5rem", lineHeight: 1.75 }}>
            비행 제어 · 통신 프로토콜 · 하드웨어 · GCS · 법규 · AI 자율<br />
            7개 도메인 {pages.length}개 지식 노드를 AI가 즉시 연결합니다
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "center", marginTop: "0.5rem" }}>
            <Link href="/chat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "1rem 2rem", background: "#06b6d4", borderRadius: "1rem", fontWeight: 700, color: "#fff", textDecoration: "none", boxShadow: "0 4px 20px rgba(6,182,212,0.4)", transition: "transform 0.15s", minWidth: "130px" }}>
              <span style={{ fontSize: "2rem", lineHeight: 1 }}>💬</span>
              <span style={{ fontSize: "0.875rem" }}>AI에게 질문하기</span>
            </Link>
            <Link href="/wiki" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "1rem 2rem", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "1rem", fontWeight: 700, color: "#fff", textDecoration: "none", backdropFilter: "blur(4px)", transition: "transform 0.15s", minWidth: "130px" }}>
              <span style={{ fontSize: "2rem", lineHeight: 1 }}>📖</span>
              <span style={{ fontSize: "0.875rem" }}>위키 둘러보기</span>
            </Link>
            <Link href="/graph" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "1rem 2rem", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "1rem", fontWeight: 700, color: "#fff", textDecoration: "none", backdropFilter: "blur(4px)", transition: "transform 0.15s", minWidth: "130px" }}>
              <span style={{ fontSize: "2rem", lineHeight: 1 }}>🔵</span>
              <span style={{ fontSize: "0.875rem" }}>지식 그래프</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 도메인 카드 */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-xl font-bold mb-2">7개 드론 도메인</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">각 도메인을 클릭해서 관련 지식을 탐색하세요</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Object.entries(DOMAIN_META).map(([domain, meta]) => (
            <Link
              key={domain}
              href={`/wiki?domain=${domain}`}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md hover:border-cyan-400 dark:hover:border-cyan-500 transition-all group"
            >
              <div className="text-2xl mb-2">{meta.emoji}</div>
              <div className="font-semibold text-sm mb-1 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                {meta.label}
              </div>
              <div className="text-xs text-slate-400">{domainCounts[domain] || 0}개 문서</div>
              <div className="mt-3 h-0.5 rounded-full opacity-60" style={{ background: meta.color }} />
            </Link>
          ))}
        </div>
      </section>

      {/* 최근 업데이트 */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold mb-2">최근 업데이트</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">가장 최근에 갱신된 지식 노드</p>
        <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
          {pages
            .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
            .slice(0, 8)
            .map((p) => (
              <Link
                key={p.slug}
                href={`/wiki/${p.slug}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{DOMAIN_META[p.domain]?.emoji || "📄"}</span>
                  <div>
                    <div className="font-medium text-sm">{p.title}</div>
                    <div className="text-xs text-slate-400">{DOMAIN_META[p.domain]?.label}</div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 shrink-0">{p.updated}</div>
              </Link>
            ))}
        </div>
        <div className="mt-4 text-center">
          <Link href="/wiki" className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline">
            전체 {pages.length}개 보기 →
          </Link>
        </div>
      </section>
    </div>
  )
}
