import fs from "fs"
import path from "path"
import type { Domain } from "./types"

export type NewsType = "news" | "release" | "job" | "gov" | "defense"

export interface NewsItem {
  title: string
  url: string
  source: string
  domain: Domain
  type: NewsType
  region?: "KR" | "global"
  summary: string
  published: string
  fetched: string
}

export const NEWS_TYPE_META: Record<NewsType, { label: string; emoji: string }> = {
  news:    { label: "뉴스",     emoji: "📰" },
  release: { label: "릴리즈",   emoji: "🚀" },
  job:     { label: "채용",     emoji: "💼" },
  gov:     { label: "정부사업", emoji: "🏛️" },
  defense: { label: "방산",     emoji: "🪖" },
}

// lib/wiki.ts resolveWikiRoot와 동일한 규칙
function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}

export function getNewsFeed(): NewsItem[] {
  const feedPath = path.join(resolveWikiRoot(), ".ua", "news-feed.json")
  if (!fs.existsSync(feedPath)) return []
  try {
    const items = JSON.parse(fs.readFileSync(feedPath, "utf-8")) as NewsItem[]
    return items.filter((it) => it.title && it.url)
  } catch {
    return []
  }
}

export interface DailyBriefing {
  date: string
  cards: { title: string; body: string }[]
}

export function getDailyBriefing(): DailyBriefing | null {
  const p = path.join(resolveWikiRoot(), ".ua", "daily-briefing.json")
  if (!fs.existsSync(p)) return null
  try {
    const d = JSON.parse(fs.readFileSync(p, "utf-8")) as DailyBriefing
    if (!d.date || !Array.isArray(d.cards) || d.cards.length === 0) return null
    return d
  } catch {
    return null
  }
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ""
  const diff = Date.now() - t
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return "방금 전"
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}일 전`
  return new Date(iso).toISOString().slice(0, 10)
}

export function sourceHost(item: NewsItem): string {
  return (item.source || "").replace(/^www\./, "")
}
