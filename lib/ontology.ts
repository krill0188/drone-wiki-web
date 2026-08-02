import fs from "fs"
import path from "path"

// ontology_lib.py(2nd-brain-ai-system)의 TypeScript 대응 버전 — G2/G3
// (2026-08-02). 두 언어로 중복 구현되는 건 이미 알려진 기술부채(하이브리드
// 검색과 동일 패턴, RESEARCH_ENGINE.md/MULTI_AGENT.md에서 이미 인지된 리스크)
// 이지만, 파일 기반 정적 배포(Vercel)와 로컬 Python 파이프라인이 분리된 이
// 구조에서는 공유 런타임을 두는 것보다 이 편이 더 단순하다.

interface ClassEntry { parent: string | null }
interface HierarchyFile { classes: Record<string, ClassEntry> }

let _hierarchyCache: Record<string, string | null> | null = null

function hierarchyPath(wikiRoot: string): string {
  return path.join(wikiRoot, "ontology", "class-hierarchy.json")
}

export function loadHierarchy(wikiRoot: string): Record<string, string | null> {
  if (_hierarchyCache) return _hierarchyCache
  try {
    const p = hierarchyPath(wikiRoot)
    if (!fs.existsSync(p)) return {}
    const raw: HierarchyFile = JSON.parse(fs.readFileSync(p, "utf-8"))
    const map: Record<string, string | null> = {}
    for (const [name, info] of Object.entries(raw.classes || {})) {
      map[name] = info.parent
    }
    _hierarchyCache = map
    return map
  } catch {
    return {}
  }
}

export function getDescendants(className: string, hierarchy: Record<string, string | null>): string[] {
  const childrenMap: Record<string, string[]> = {}
  for (const [name, parent] of Object.entries(hierarchy)) {
    if (parent) {
      if (!childrenMap[parent]) childrenMap[parent] = []
      childrenMap[parent].push(name)
    }
  }
  const seen = new Set<string>()
  const result: string[] = []
  const stack = [...(childrenMap[className] || [])]
  while (stack.length > 0) {
    const node = stack.pop() as string
    if (seen.has(node)) continue
    seen.add(node)
    result.push(node)
    stack.push(...(childrenMap[node] || []))
  }
  return result
}

/** 질의에 클래스명이 (대소문자 무관) 포함돼 있으면 하위 클래스명들을 반환.
 * 매칭 없으면 빈 배열 — 억지로 확장하지 않는다. */
export function expandQueryClassTerms(query: string, wikiRoot: string): string[] {
  const hierarchy = loadHierarchy(wikiRoot)
  const qLower = query.toLowerCase()
  const extra: string[] = []
  for (const className of Object.keys(hierarchy)) {
    if (qLower.includes(className.toLowerCase())) {
      for (const d of getDescendants(className, hierarchy)) {
        if (!extra.includes(d)) extra.push(d)
      }
    }
  }
  return extra
}
