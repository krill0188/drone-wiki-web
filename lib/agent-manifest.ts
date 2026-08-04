import { getAllPages } from "./wiki"
import { DOMAIN_META, type Domain } from "./types"

// openwiki 벤치마킹: openwiki는 code-wiki를 생성할 때마다 레포 루트 AGENTS.md/CLAUDE.md의
// <!-- OPENWIKI:START -->…<!-- OPENWIKI:END --> 블록만 다시 써서, 코딩 에이전트가 작업을
// 시작하기 전에 "위키부터 먼저 봐라"는 지침과 위키 구조를 항상 최신 상태로 참조하게
// 만든다(레포에 커밋되는 정적 파일 + 자동 갱신 블록 조합).
//
// 이 프로젝트의 AI Q&A/드론 빌더는 이미 매 요청마다 GraphRAG(lib/rag.ts +
// lib/graphrag.ts)로 질의에 맞는 위키 문서를 찾아 시스템 프롬프트에 박아 넣는다 —
// 검색 결과가 있다는 점에서 openwiki의 "정적 파일"보다 이미 더 근거 중심적이다.
// 하지만 정적 매니페스트가 주는 건 다르다: "이 위키가 통째로 무엇을 커버하는가"라는
// 지형도(地形圖)다. 검색이 질의와 안 겹쳐서 놓친 관련 문서가 있어도, 에이전트가
// 매니페스트를 보고 "이 도메인에 관련 문서가 있을 가능성이 높다"고 추론할 수 있다.
// 그래서 파일로 커밋하는 대신(위키 문서 수가 배포마다 바뀌므로 커밋 오버헤드),
// 요청 시점에 동적으로 만들어 GraphRAG 검색 결과보다 앞에 얹는다 — 두 레이어가
// 서로 보완한다: 매니페스트(전체 지형도) → GraphRAG(질의 맞춤 근거).
const CACHE_TTL_MS = 5 * 60 * 1000
let _cache: { manifest: string; at: number } | null = null

export async function buildAgentManifest(): Promise<string> {
  const now = Date.now()
  if (_cache && now - _cache.at < CACHE_TTL_MS) return _cache.manifest

  const pages = await getAllPages()
  const byDomain = new Map<string, number>()
  for (const p of pages) {
    if (!p.domain) continue
    byDomain.set(p.domain, (byDomain.get(p.domain) || 0) + 1)
  }

  const domainLines = (Object.keys(DOMAIN_META) as Domain[])
    .filter((d) => byDomain.has(d))
    .map((d) => `- ${DOMAIN_META[d].emoji} ${DOMAIN_META[d].label} (${d}): 문서 ${byDomain.get(d)}건`)
    .join("\n")

  const recentTitles = [...pages]
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 8)
    .map((p) => `  - ${p.title} [${p.slug}]`)
    .join("\n")

  const manifest = `<wiki-manifest>
DroneWiki는 총 ${pages.length}개 문서로 구성된 드론 전문 지식 위키다. 아래는 위키 전체의
구조 지도다 — 답변하기 전에 이 지도로 "이 질문이 위키가 다루는 범위인지, 어느 도메인에
해당하는지"부터 판단해라. 검색 결과(<knowledge-base>, <graph-connections>)가 비어 있거나
빈약해도 이 지도에 관련 도메인 문서가 있다면 그 존재를 언급하고, 위키 밖 일반 지식으로
바로 건너뛰지 마라. 반대로 위키에 없는 내용은 위키에 있다고 지어내지 말고 "위키에는 없는
내용"이라고 명시해라.

도메인별 문서 수:
${domainLines || "(문서 없음)"}

최근 갱신된 문서 (최신순):
${recentTitles || "(없음)"}
</wiki-manifest>`

  _cache = { manifest, at: now }
  return manifest
}
