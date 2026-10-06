import type { RagSource, NewsHit } from "@/lib/rag"
import type { DocContext } from "@/lib/types"
import type { DocViewRecord } from "@/lib/session-store"

// app/api/chat/route.ts(공개 웹 Q&A)와 app/api/bot-chat/route.ts(텔레그램 봇 Q&A)가
// 공유한다 — 2026-10-04, 봇 경로 추가하며 중복 방지 목적으로 분리했다(동작 변경 없음).

const DOC_CONTEXT_MAX_CHARS = 4000

export function buildSystemPrompt(
  manifest: string,
  docContext: DocContext | null,
  recentDocs: DocViewRecord[],
  sources: RagSource[],
  graphBlock: string,
  newsHits: NewsHit[]
): string {
  const contextParts = sources.map((s, i) => {
    // 2026-08-20 팔란티어 온톨로지 Link 보강 — frontmatter 구조화 속성과
    // 서브섬션 추론 체인(ontology_subsumption)을 명시적으로 노출한다.
    // 예전엔 excerpt(본문 앞 600자)만 넘겨 "무게가 몇 그램이야?" 같은 질문에
    // frontmatter에만 있는 값을 AI가 못 찾았다(실측 확인된 문제).
    const propsLine = s.properties && Object.keys(s.properties).length
      ? `\n${s.origin === "raw" ? "출처 정보" : "온톨로지 속성"}: ${Object.entries(s.properties).map(([k, v]) => `${k}=${v}`).join(", ")}`
      : ""
    // raw는 daily-ingest가 아직 검증·컴파일하지 않은 원문(Layer 1)이다 — canonical과
    // 신뢰도가 다르므로 컨텍스트에 명시해 모델이 그에 맞게 인용하도록 한다.
    const originTag = s.origin === "raw" ? " [원문·미검증]" : ""
    return `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}${originTag}\n${s.excerpt}${propsLine}`
  })
  const newsParts = newsHits.map(
    (n, i) => `[N${i + 1}] (${n.type}${n.region ? `/${n.region}` : ""}) ${n.title}${n.excerpt ? ` — ${n.excerpt}` : ""}`
  )

  const currentDocBlock = docContext
    ? `사용자가 지금 화면에서 보고 있는 문서:
<current-document slug="${docContext.slug}" title="${docContext.title}">
${docContext.content.slice(0, DOC_CONTEXT_MAX_CHARS)}
</current-document>

`
    : ""

  // 이 브라우저 세션에서 최근 열람한 문서 목록(익명, 쿠키 세션 기준) — 사용자가
  // "이 주제로 AI에게 더 질문하기"를 눌렀을 때 이전에 뭘 봤는지 감안해 답변을
  // 더 개인화된 흐름으로 이어가기 위함. 개인 식별 정보는 포함하지 않는다.
  const recentDocsBlock = recentDocs.length
    ? `이 세션에서 최근 열람한 문서(최신순, 현재 문서 제외):
<recently-viewed>
${recentDocs
  .filter((d) => d.slug !== docContext?.slug)
  .map((d) => `- ${d.title} (${d.domain || "미분류"})`)
  .join("\n")}
</recently-viewed>

`
    : ""

  return `당신은 드론 도메인 전문가 AI입니다. 아래 컨텍스트(위키 전체 지도, 현재 보고 있는 문서, RAG로 검색된 지식 베이스, 최신 뉴스)를 근거로 사용자 질문에 완전하고 상세하게 답변하세요.

${manifest}

${currentDocBlock}${recentDocsBlock}<knowledge-base>
${contextParts.join("\n\n") || "(관련 위키 문서 없음)"}
</knowledge-base>

${graphBlock ? `${graphBlock}\n\n` : ""}<latest-news>
${newsParts.join("\n") || "(관련 최신 뉴스 없음)"}
</latest-news>

답변 지침:
- <current-document>가 있으면 그 내용을 최우선 근거로 삼아 답변
- 지식 베이스와 최신 뉴스를 종합하여 구체적으로 답변
- <graph-connections>가 있으면 서로 다른 주제·도메인 사이의 연결고리를 설명할 때
  적극 활용해, 문서 하나로는 안 보이는 융합적 답변을 제공(특정 두 분야로 한정하지 말고
  질문에 실제로 걸리는 모든 영역을 자유롭게 연결)
- <recently-viewed>가 있으면 참고해 답변 흐름을 이어가되, 억지로 언급하지 말고
  자연스럽게 걸릴 때만 활용
- 최신 동향·채용·정부사업·방산 질문이면 <latest-news>를 적극 활용
- 문서에 "온톨로지 속성" 줄이 있으면 무게·제조사·MCU 등 수치/사실 질문에 최우선 근거로
  활용. ontology_subsumption(예: "ComputeUnit ⊑ PhysicalEntity ⊑ Thing")은 클래스 계층
  추론 결과다 — "이게 무슨 종류의 장치야?" 같은 분류 질문에 이 체인으로 답변
- 핵심 개념, 작동 원리, 기술 비교, 실용 정보를 충분히 포함
- 소제목이나 목록을 활용해 가독성 있게 구성
- 위키 출처는 [1], 뉴스 출처는 [N1] 형식으로 인용
- 한국어로 답변`
}
