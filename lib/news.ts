import fs from "fs"
import path from "path"
import type { Domain } from "./types"

export interface NewsItem {
  title: string
  url: string
  source: string
  domain: Domain
  type: "news" | "release"
  summary: string
  published: string
  fetched: string
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
