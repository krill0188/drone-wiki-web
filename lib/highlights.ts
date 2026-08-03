import fs from "fs"
import path from "path"

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}
const WIKI_ROOT = resolveWikiRoot()
const HIGHLIGHTS_PATH = path.join(WIKI_ROOT, ".ua", "highlights.json")

export interface Highlight {
  sourceSlug: string
  sourceTitle: string
  text: string
  savedAt: string
}

// "지식으로 저장하기"는 위키 지식 베이스(concepts/entities)에 바로 파일을 쓰는 게
// 아니라 가벼운 하이라이트 로그에 append한다 — 정식 문서 생성은 이미 있는 AI 위키
// 에디터/discovery 승격 UI가 맡고, 여기는 "나중에 볼 만한 문장 북마크"에 가깝다.
// 그래도 파일 쓰기이므로 배포된 공개 사이트에서는 막는다.
export function isHighlightWritable(): boolean {
  return !process.env.VERCEL
}

export function appendHighlight(h: Omit<Highlight, "savedAt">): Highlight {
  let list: Highlight[] = []
  if (fs.existsSync(HIGHLIGHTS_PATH)) {
    try {
      list = JSON.parse(fs.readFileSync(HIGHLIGHTS_PATH, "utf-8"))
    } catch {
      list = []
    }
  }
  const entry: Highlight = { ...h, savedAt: new Date().toISOString() }
  list.push(entry)
  fs.mkdirSync(path.dirname(HIGHLIGHTS_PATH), { recursive: true })
  fs.writeFileSync(HIGHLIGHTS_PATH, JSON.stringify(list, null, 2))
  return entry
}
