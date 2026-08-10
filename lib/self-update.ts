import fs from "fs"
import path from "path"
import { ragSearch } from "./rag"
import { getNewsFeed } from "./news"

// openwiki 벤치마킹: openwiki는 GitHub/GitLab/Bitbucket CI에서 openwiki --update를
// 주기 실행해 저장소 변경분을 위키에 자동 반영하고, "변경 없으면 아무것도 안 씀"(스냅샷
// diff로 no-op run은 공짜)을 원칙으로 삼는다. 이 파이프라인도 같은 원칙을 따른다:
// .ua/news-feed.json(최신 드론 뉴스·논문 수집 결과, lib/news.ts와 동일 소스)에서
// 아직 처리하지 않은 항목만 골라 기존 ragSearch로 관련 위키 문서를 찾고, "이 문서에
// 최근 소식 하나가 새로 엮인다"는 제안(proposal)을 만든다. discovery-review와 동일하게
// 사람 검토 없이 canonical 문서를 direct write하지 않는다 — 로컬(비Vercel) 환경에서만
// 명시적으로 적용(apply)할 수 있고, 적용한 뉴스 URL은 상태 파일에 기록해 재실행 시
// 중복 제안하지 않는다.

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}

const WIKI_ROOT = resolveWikiRoot()
const LAYER_DIRS = ["concepts", "entities", "comparisons", "queries"]
const STATE_PATH = path.join(WIKI_ROOT, ".ua", "self-update-state.json")
const SECTION_HEADER = "## 📰 최근 관련 소식"
const NEWS_PER_ITEM_MATCHES = 2

// Vercel(process.env.VERCEL이 항상 설정됨)에서는 항상 false — 위키 문서에 직접
// 쓰는 API는 이 값을 반드시 확인하고 false면 거부해야 한다(다른 write 게이트들과 동일 패턴).
export function isSelfUpdateWritable(): boolean {
  return !process.env.VERCEL
}

interface SelfUpdateState {
  [newsUrl: string]: { processedAt: string; matchedSlugs: string[] }
}

function loadState(): SelfUpdateState {
  if (!fs.existsSync(STATE_PATH)) return {}
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"))
  } catch {
    return {}
  }
}

function saveState(state: SelfUpdateState): void {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function findDocPath(slug: string): string | null {
  for (const dir of LAYER_DIRS) {
    const p = path.join(WIKI_ROOT, dir, `${slug}.md`)
    if (fs.existsSync(p)) return p
  }
  return null
}

export interface SelfUpdateProposal {
  newsUrl: string
  newsTitle: string
  newsSource: string
  newsType: string
  newsDate: string
  slug: string
  docTitle: string
  score: number
  bullet: string
}

// 뉴스 피드에서 아직 처리하지 않은 항목을 기존 ragSearch로 위키 문서와 교차 참조한다.
// 새 무거운 파이프라인을 만드는 대신 이미 챗봇·드론빌더가 쓰는 검색 로직을 그대로 재사용.
export function getSelfUpdateProposals(limit = 20): SelfUpdateProposal[] {
  const feed = getNewsFeed()
  const state = loadState()
  const unprocessed = feed.filter((it) => !state[it.url]).slice(0, limit)

  const proposals: SelfUpdateProposal[] = []
  for (const item of unprocessed) {
    const query = `${item.title} ${item.summary_ko || item.summary}`.trim()
    if (!query) continue
    const hits = ragSearch(query, NEWS_PER_ITEM_MATCHES)
    const newsDate = (item.published || item.fetched || "").slice(0, 10)
    for (const hit of hits) {
      proposals.push({
        newsUrl: item.url,
        newsTitle: item.title,
        newsSource: item.source,
        newsType: item.type,
        newsDate,
        slug: hit.slug,
        docTitle: hit.title,
        score: hit.score,
        bullet: `- ${item.title} (${item.source}${newsDate ? `, ${newsDate}` : ""}) — ${item.url}`,
      })
    }
  }
  return proposals.sort((a, b) => b.score - a.score)
}

// 불릿 "- <title> (<source>, <date>) — <url>"에서 title만 뽑아 비교키로 쓴다.
function bulletTitleKey(bullet: string): string {
  const m = bullet.match(/^- (.+?) \(/)
  return (m ? m[1] : bullet).trim().toLowerCase()
}

// SECTION_HEADER 섹션에 불릿을 삽입한다. 섹션이 없으면 문서 끝에 새로 만든다.
// 같은 뉴스(정규화한 제목 기준)가 이미 섹션에 있으면 그대로 반환(멱등).
// 주의: 예전엔 "전체 불릿 문자열이 그대로 있는가"로만 비교했는데, Google News
// RSS는 같은 기사를 재수집할 때마다 다른 리다이렉트 URL을 발급한다 — URL까지
// 포함해 비교하면 제목이 같아도 URL만 다르면 중복 삽입된다(2026-08-10 발견,
// entities/sol-one.md 등 9개 문서에서 중복 확인). 제목 기준 비교로 교체.
function insertBullet(raw: string, bullet: string): string {
  const headerIdx = raw.indexOf(SECTION_HEADER)
  if (headerIdx === -1) {
    return `${raw.trimEnd()}\n\n${SECTION_HEADER}\n${bullet}\n`
  }
  const afterHeader = headerIdx + SECTION_HEADER.length
  const nextHeadingIdx = raw.indexOf("\n## ", afterHeader)
  const sectionEnd = nextHeadingIdx === -1 ? raw.length : nextHeadingIdx
  const existingSection = raw.slice(afterHeader, sectionEnd)
  const newKey = bulletTitleKey(bullet)
  const alreadyPresent = existingSection
    .split("\n")
    .some((line) => line.startsWith("- ") && bulletTitleKey(line) === newKey)
  if (alreadyPresent) return raw
  return `${raw.slice(0, sectionEnd).trimEnd()}\n${bullet}\n${raw.slice(sectionEnd)}`
}

export function applyProposal(p: SelfUpdateProposal): { ok: boolean; error?: string } {
  if (!isSelfUpdateWritable()) {
    return { ok: false, error: "이 기능은 로컬 개발 환경에서만 사용할 수 있습니다(배포된 사이트에서는 위키 문서를 쓸 수 없습니다)." }
  }
  const filePath = findDocPath(p.slug)
  if (!filePath) return { ok: false, error: `문서를 찾을 수 없습니다: ${p.slug}` }

  const raw = fs.readFileSync(filePath, "utf-8")
  const updated = insertBullet(raw, p.bullet)
  if (updated !== raw) fs.writeFileSync(filePath, updated)

  const state = loadState()
  const prev = state[p.newsUrl]?.matchedSlugs ?? []
  state[p.newsUrl] = {
    processedAt: new Date().toISOString(),
    matchedSlugs: prev.includes(p.slug) ? prev : [...prev, p.slug],
  }
  saveState(state)

  return { ok: true }
}

// 특정 뉴스 URL을 "검토했지만 반영 안 함" 상태로 표시 — 재실행 시 다시 제안되지 않게.
export function skipNews(newsUrl: string): void {
  const state = loadState()
  state[newsUrl] = { processedAt: new Date().toISOString(), matchedSlugs: [] }
  saveState(state)
}

// discovery-review와 동일한 승인/반려 카운트 배지에 쓰인다.
export function getSelfUpdateStats(): { appliedCount: number; skippedCount: number } {
  const values = Object.values(loadState())
  return {
    appliedCount: values.filter((v) => v.matchedSlugs.length > 0).length,
    skippedCount: values.filter((v) => v.matchedSlugs.length === 0).length,
  }
}
