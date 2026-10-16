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
  newsHits: NewsHit[],
  ontologyBlock = ""
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

${ontologyBlock ? `${ontologyBlock}\n\n` : ""}${graphBlock ? `${graphBlock}\n\n` : ""}<latest-news>
${newsParts.join("\n") || "(관련 최신 뉴스 없음)"}
</latest-news>

답변 지침:
- <ontology>가 있으면 온톨로지 우선으로 답한다: ① 질문이 가리키는 클래스와 계층상 위치 → ② 클래스 간 관계(무엇이 무엇을
  구동·전원공급·장착·호환 확인해야 하는지) → ③ 위키 문서([1] 등)를 근거로 한 구체 사실·수치 순서로 구성.
  클래스 관계는 구조 정의일 뿐 개별 제품 수치의 근거가 아니므로, 수치·사양은 반드시 지식 베이스 문서에서 인용하고
  문서에 없으면 "확인 필요"로 표시. [AI 추출·미검증] 관계는 확정 사실처럼 쓰지 말 것
- <inference>가 있으면 규칙 엔진의 결정론적 결과다: ① 종합 판정에서 FAIL/WARN을 답변 맨 앞에서 먼저 지적 → ② 적용된 규칙을
  "전제 → 결론" 체인으로(규칙 ID 포함) 풀어서 설명 → ③ 변경 파급(무엇을 같이 재검토해야 하는지) → ④ "추가 입력" 항목은
  마지막에 질문으로 제시. 수치와 판정을 직접 재계산·변경하지 말고, 경험칙은 통례임을 밝힐 것
- <architecture>가 있으면 기본구조 온톨로지(HW+SW·통신·분야 간 결합) 추론 결과다: 구조는 "HW 계층 / SW 계층 / 관여 공학 분야"로 먼저
  정리 → 임무가 있으면 ★숨은 의존성을 강조 → 통신·프로토콜은 ✓/✗ 판정과 이유, 어댑터 경로를 그대로 제시 → 결합 파급을
  "원인→분야→결과" 체인으로 설명. 마지막에 창조 지침(교차 분야 연쇄, 대안 가설+검증 실험)을 반드시 수행. 이 블록은 저자 정의
  설계 지식이므로 제품 수치처럼 단정하지 말고 "일반적으로"로 한정
- <synthesis>가 있으면 수집된 제품 개체를 조합·합성해 규칙 엔진이 거른 후보 설계다: 상위 후보를 표로 보여 주고, 각 후보가
  성립하는 이유(물리 규칙)와 "합성 팩" 항목의 위험(BMS·열·방전율)·검증 방법과, 모든 후보가 실기 미검증임을 설명한 뒤, 후보 집합 밖의 설계 방향은 반드시
  "가설"로 라벨링해 제안. 정보 빈틈은 "다음에 수집할 자료"로 안내. 후보 수치를 바꾸거나 없는 제품 수치를 만들지 말 것
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
