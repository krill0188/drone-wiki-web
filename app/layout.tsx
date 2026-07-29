import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"

export const metadata: Metadata = {
  title: "DroneWiki — 드론 특화 AI 지식 플랫폼",
  description: "드론 비행제어·통신·하드웨어·GCS·법규·AI 자율 — 모든 드론 기술 지식을 AI와 함께.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
              <span className="text-xl">🛸</span>
              <span className="text-cyan-600 dark:text-cyan-400">Drone</span>Wiki
            </Link>
            <nav className="flex items-center gap-0.5 sm:gap-1 text-sm font-medium">
              <Link href="/news" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span>📰</span><span className="hidden sm:inline">뉴스</span>
              </Link>
              <Link href="/wiki" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span>📖</span><span className="hidden sm:inline">위키</span>
              </Link>
              <Link href="/graph" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span>🔵</span><span className="hidden sm:inline">지식 그래프</span>
              </Link>
              <Link href="/chat" className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span>💬</span><span className="hidden sm:inline">AI Q&amp;A</span>
              </Link>
              <Link href="/chat" className="hidden md:flex items-center gap-1.5 ml-2 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors">
                <span>✨</span><span>질문하기</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-16">
          <div className="max-w-6xl mx-auto px-4 py-8 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
            <span>🛸 DroneWiki — 드론 기술 지식 플랫폼</span>
            <span>Powered by LLM-Wiki · Neo4j · LangGraph · Next.js</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
