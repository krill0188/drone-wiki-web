import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"
import LangToggle from "@/components/LangToggle"
import { WikiDocProvider } from "@/components/WikiDocContext"
import ChatWidget from "@/components/Chat"

export const metadata: Metadata = {
  title: "DroneWiki — 드론 특화 AI 지식 플랫폼",
  description: "드론 비행제어·통신·하드웨어·GCS·법규·AI 자율 — 모든 드론 기술 지식을 AI와 함께.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen flex flex-col bg-white text-slate-900">
        <WikiDocProvider>
        <header className="bg-cyan-700">
          <div className="max-w-3xl mx-auto px-4 h-11 flex items-center gap-4 text-white">
            <Link href="/" className="font-bold text-[15px] tracking-tight shrink-0">
              🛸 DroneWiki
            </Link>
            <nav className="flex items-center gap-4 sm:gap-5 text-[13px] overflow-x-auto">
              <Link href="/news" className="hover:underline whitespace-nowrap">뉴스</Link>
              <Link href="/chat" className="hover:underline whitespace-nowrap">AI Q&amp;A</Link>
              <Link href="/wiki-editor" className="hover:underline whitespace-nowrap">✍️ AI 에디터</Link>
              <Link href="/ai-drone-builder" className="hover:underline whitespace-nowrap">🚀 AI 드론 빌더</Link>
            </nav>
            <div className="ml-auto shrink-0">
              <LangToggle />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 mt-12">
          <div className="max-w-3xl mx-auto px-4 py-6 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>🛸 DroneWiki</span>
            <Link href="/news" className="hover:underline">뉴스</Link>
            <Link href="/chat" className="hover:underline">AI Q&amp;A</Link>
            <Link href="/wiki-editor" className="hover:underline">AI 에디터</Link>
            <Link href="/ai-drone-builder" className="hover:underline">AI 드론 빌더</Link>
            <span className="ml-auto">매일 새벽 자동 갱신</span>
          </div>
        </footer>

        <ChatWidget />
        </WikiDocProvider>
      </body>
    </html>
  )
}
