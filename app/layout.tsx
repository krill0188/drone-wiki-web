import type { Metadata } from "next"
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"
import Link from "next/link"
import LangToggle from "@/components/LangToggle"
import { WikiDocProvider } from "@/components/WikiDocContext"
import ChatWidget from "@/components/Chat"

const displayFont = Space_Grotesk({ subsets: ["latin"], variable: "--ds-display", weight: ["500", "700"] })
const bodyFont = Inter({ subsets: ["latin"], variable: "--ds-body" })
const monoFont = IBM_Plex_Mono({ subsets: ["latin"], variable: "--ds-hud", weight: ["500", "600"] })

export const metadata: Metadata = {
  title: "DroneWiki — 드론 특화 AI 지식 플랫폼",
  description: "드론 비행제어·통신·하드웨어·GCS·법규·AI 자율 — 모든 드론 기술 지식을 AI와 함께.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className="min-h-screen flex flex-col bg-paper text-ink font-body">
        <WikiDocProvider>
        <header className="bg-ink">
          <div className="max-w-3xl mx-auto px-4 h-12 flex items-center gap-5 text-white">
            <Link href="/" className="flex items-center gap-1.5 font-display font-bold text-[15px] tracking-tight shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-500 shadow-[0_0_6px_var(--color-signal-500)]" />
              🛸 DroneWiki
            </Link>
            <nav className="flex items-center gap-4 sm:gap-5 text-[13px] font-hud tracking-wide overflow-x-auto">
              <Link href="/news" className="text-white/70 hover:text-signal-400 transition-colors whitespace-nowrap">뉴스</Link>
              <Link href="/chat" className="text-white/70 hover:text-signal-400 transition-colors whitespace-nowrap">AI Q&amp;A</Link>
              <Link href="/wiki-editor" className="text-white/70 hover:text-signal-400 transition-colors whitespace-nowrap">AI 에디터</Link>
              <Link href="/ai-drone-builder" className="text-white/70 hover:text-signal-400 transition-colors whitespace-nowrap">AI 드론 빌더</Link>
            </nav>
            <div className="ml-auto shrink-0">
              <LangToggle />
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-signal-500/60 via-signal-500/10 to-transparent" />
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line mt-12">
          <div className="max-w-3xl mx-auto px-4 py-6 text-xs font-hud text-ink-dim flex flex-wrap gap-x-4 gap-y-1">
            <span>🛸 DroneWiki</span>
            <Link href="/news" className="hover:text-signal-600 transition-colors">뉴스</Link>
            <Link href="/chat" className="hover:text-signal-600 transition-colors">AI Q&amp;A</Link>
            <Link href="/wiki-editor" className="hover:text-signal-600 transition-colors">AI 에디터</Link>
            <Link href="/ai-drone-builder" className="hover:text-signal-600 transition-colors">AI 드론 빌더</Link>
            <span className="ml-auto">매일 새벽 자동 갱신</span>
          </div>
        </footer>

        <ChatWidget />
        </WikiDocProvider>
      </body>
    </html>
  )
}
