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

/** 2026-08-20 — 서브섬션(subsumption) 추론: 클래스에서 루트(Thing)까지의
 * 조상 체인을 반환한다(예: ComputeUnit → ["PhysicalEntity", "Thing"]).
 * agent-workflows(justinjoy) 패턴("A ⊑ B 서브섬션 추론") 응용 — 지금까지는
 * apply-kinetic-rules.py가 오프라인 배치로 SPARQL 조건매칭만 했는데, 이건
 * 실시간 질의응답(RAG)에서 "이 문서가 속한 클래스와 그 상위개념"을 답변
 * 근거로 쓸 수 있게 하는 진짜 클래스 계층 추론이다. */
export function getAncestors(className: string, hierarchy: Record<string, string | null>): string[] {
  const chain: string[] = []
  let current = hierarchy[className]
  const seen = new Set<string>([className])
  while (current && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = hierarchy[current]
  }
  return chain
}

/** RAG 문서의 ontology_class(예: "ComputeUnit")를 "ComputeUnit ⊑ PhysicalEntity ⊑ Thing"
 * 형태의 서브섬션 체인 문자열로 변환. 클래스가 계층에 없으면 null. */
export function describeOntologyClass(className: string, wikiRoot: string): string | null {
  const hierarchy = loadHierarchy(wikiRoot)
  if (!(className in hierarchy)) return null
  const ancestors = getAncestors(className, hierarchy)
  return [className, ...ancestors].join(" ⊑ ")
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
