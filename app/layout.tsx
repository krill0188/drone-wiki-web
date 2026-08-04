import type { Metadata } from "next"
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"
import { WikiDocProvider } from "@/components/WikiDocContext"
import ChatWidget from "@/components/Chat"
import AppSidebar from "@/components/AppSidebar"
import DroneIcon from "@/components/DroneIcon"

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
      <body className="min-h-screen bg-paper text-ink font-body">
        <WikiDocProvider>
          {/* GPT/Gemini 스타일 — 상단 헤더 없이 좌측 글로벌 사이드바 하나로 전체 내비게이션 통합 */}
          <div className="flex min-h-screen">
            <AppSidebar />
            <div className="flex-1 min-w-0 flex flex-col">
              <main className="flex-1">{children}</main>
              <footer className="border-t border-line mt-12">
                <div className="max-w-3xl mx-auto px-4 py-6 text-xs font-hud text-ink-dim flex items-center gap-1.5">
                  <DroneIcon className="w-3.5 h-3.5" />
                  DroneWiki · 매일 새벽 자동 갱신
                </div>
              </footer>
            </div>
          </div>
          <ChatWidget />
        </WikiDocProvider>
      </body>
    </html>
  )
}
