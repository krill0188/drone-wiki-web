import { NextRequest } from "next/server"
import { streamText, createUIMessageStreamResponse, toUIMessageStream } from "ai"
import { createUIMessageStream } from "ai"
import { wikiModel } from "@/lib/ai-model"
import { evaluateBuilderGate, parseSpec } from "@/lib/design-gate"
import { isPaperComponent, matchPaperConfig, paperBlock, specHint, validatePaperConfig } from "@/lib/paper-config"
import { matchProducts, type MatchData } from "@/lib/product-match"
import { soften } from "@/lib/soften"
import { crossChecks, crossAdvisory } from "@/lib/cross-rules"
import { buildOntologyContext } from "@/lib/ontology-qa"
import { planQuery } from "@/lib/kg-plan"
import { repairHwSelections, validateHw, validateSw, validateTechspec, validateArchitecture, validateImplementation, renderValidation, type Validation } from "@/lib/stage-validate"
import { ragSearch } from "@/lib/rag"
import { graphRagSearch } from "@/lib/graphrag"
import { buildAgentManifest } from "@/lib/agent-manifest"
import { buildGateNote } from "@/lib/gates-adapter"
import { selectPaperClaims, paperEvidenceBlock, paperEvidenceNote } from "@/lib/paper-evidence"
import { stageConsistencyNote } from "@/lib/stage-consistency"

// "AI 드론을 기획하고 개발해줘" 같은 요청을 6개 전문 에이전트가 단계별로 협업해
// 무에서 유로 만들어내는 멀티 에이전트 오케스트레이션 (2026-10-16 6단계 + 사람 승인 게이트).
//   1 기획 → 2 HW 스펙 → 3 SW 스펙 → 4 기술 스펙(통합 검증) → 5 아키텍처 → 6 코드·로드맵
// 단계 사이의 승인/반려/마감은 클라이언트(app/ai-drone-builder/page.tsx)가 관리한다 —
// 이 라우트는 stage 하나를 받아 그 단계의 에이전트만 실행한다. 반려되면 이전 결과와
// 사유(context.feedback)를 받아 같은 단계를 다시 쓴다. 각 단계는 단계에 맞는 질의로
// GraphRAG(lib/rag.ts + lib/graphrag.ts)를 다시 조회해 새 근거를 찾는다.

export const maxDuration = 300

type Stage = "proposal" | "hw" | "sw" | "techspec" | "architecture" | "implementation"

interface StageContext {
  proposal?: string
  hw?: string
  sw?: string
  techspec?: string
  architecture?: string
  // 반려 시: 직전 결과와 사유. 같은 단계를 사유에 맞춰 다시 쓴다.
  feedback?: { previous?: string; reason?: string }
}

const GROUNDING_EXCERPT_CHARS = 500
const GEN_TIMEOUT_MS = 120_000 // 1회 생성 상한
const REWRITE_DEADLINE_MS = 150_000 // 이 시각을 넘기면 재작성 생략

// NVIDIA NIM 무료 엔드포인트는 생성 속도가 들쭉날쭉하므로 단계별 분량을 제한해
// 제한시간 안에 끝나게 한다(분량 지시 + 토큰 상한을 함께 둔다).
const STAGE_LIMITS: Record<Stage, { chars: number; maxOutputTokens: number }> = {
  proposal: { chars: 2500, maxOutputTokens: 3000 },
  hw: { chars: 4000, maxOutputTokens: 5000 },
  sw: { chars: 3500, maxOutputTokens: 4500 },
  techspec: { chars: 4200, maxOutputTokens: 5200 },
  architecture: { chars: 3500, maxOutputTokens: 4500 },
  implementation: { chars: 4000, maxOutputTokens: 5000 },
}

// 단계별 검색 편향 키워드 — HW 단계는 부품·전원 문서/논문을, SW 단계는 비행스택·미들웨어를
// 우선 찾게 해 "위키 요약" 한 덩어리가 되는 것을 막는다.
const STAGE_QUERY_HINT: Partial<Record<Stage, string>> = {
  hw: "배터리 모터 ESC 프로펠러 프레임 비행제어기 센서 페이로드 하드웨어",
  sw: "비행스택 PX4 ArduPilot ROS2 MAVLink GCS 컴패니언 컴퓨터 소프트웨어",
  techspec: "인터페이스 호환 규정 성능 요구사항",
}

const ONTOLOGY_CLASSES = `# 온톨로지 클래스 (구성요소마다 아래 중 하나를 지정할 것)
Drone(Multirotor·FixedWing·VTOL) / Sensor(IMU·GNSS·Camera·LiDAR·Barometer·Magnetometer) /
Actuator(Motor·ESC·Gimbal·Propeller) / ComputeUnit(FlightController·CompanionComputer) /
Battery / Frame / Datalink / Payload / FlightStack(PX4·ArduPilot) / MiddlewareFramework(ROS2) /
AIModel / Mission. 이 목록에 없는 요소는 클래스를 "미정의"로 쓰고 '온톨로지 보강 필요'에 모아라.`

function clip(text: string | undefined, max: number, fallback: string): string {
  const t = (text ?? "").trim()
  return t ? t.slice(0, max) : fallback
}

function buildGroundingBlock(query: string): string {
  const sources = ragSearch(query, 8, { diversify: true })
  const graph = graphRagSearch(query, sources.map((s) => s.slug), { focus: true })
  const kb = sources
    .map((s, i) => {
      const propsLine = s.properties && Object.keys(s.properties).length
        ? `\n${s.origin === "raw" ? "출처 정보" : "온톨로지 속성"}: ${Object.entries(s.properties).map(([k, v]) => `${k}=${v}`).join(", ")}`
        : ""
      const originTag = s.origin === "raw" ? " [원문·미검증]" : ""
      return `[${i + 1}] **${s.title}**${s.domain ? ` (${s.domain})` : ""}${originTag}\n${s.excerpt}${propsLine}`
    })
    .join("\n\n")
  return `<knowledge-base>\n${kb || "(관련 위키 문서 없음)"}\n</knowledge-base>\n\n${graph.block}`
}

const GROUNDING_NOTE = `아래는 DroneWiki 지식 베이스에서 검색된 관련 자료(RAG)와 그래프 탐색으로 찾은 개념 연결고리다 —
실제 존재하는 이름·파라미터·프로토콜을 근거로 쓰고, 수치를 지어내지 마라(근거가 없으면 "재확인 필요").
[AI 추출·미검증]·[원문·미검증] 항목은 참고만 하고 단정하지 마라.`

function proposalSystemPrompt(manifest: string, grounding: string): string {
  return `당신은 DroneWiki 소속 '기획서 작성 에이전트'다. 6단계 협업 파이프라인의 1단계를 맡는다
(2단계 HW 스펙 → 3단계 SW 스펙 → 4단계 기술 스펙 → 5단계 아키텍처 → 6단계 코드·로드맵이 이어받는다).
사용자가 제시한 드론 컨셉을 실행 가능한 프로젝트 기획서로 만드는 것이 임무다.

${manifest}

${GROUNDING_NOTE}

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 배경 및 목적
## 2. 핵심 목표
## 3. 주요 기능
## 4. 운용 시나리오
## 5. 제약사항 및 규정 검토 (지식베이스에 규정 관련 근거가 있으면 반드시 인용, 없으면 "재확인 필요")
## 6. 성공 지표(KPI)

원문/지식베이스에 없는 사실을 지어내지 말고, 불확실한 부분은 "재확인 필요"로 명시해라. 한국어로 작성.`
}

function hwSystemPrompt(manifest: string, grounding: string, c: StageContext): string {
  return `당신은 DroneWiki 소속 'HW 스펙 에이전트'다. 6단계 협업 파이프라인의 2단계를 맡는다.
승인된 기획서를 받아 하드웨어 구성을 구체화하는 것이 임무다. 소프트웨어는 다음 단계가 맡으니 다루지 마라.

${manifest}

<proposal>
${clip(c.proposal, 2500, "(기획서 없음)")}
</proposal>

${GROUNDING_NOTE}

${grounding}

${ONTOLOGY_CLASSES}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. HW 구성요소 표
| 구성요소 | 온톨로지 클래스 | 선정안 | 핵심 사양 | 인터페이스 | 근거 |
(기체·프레임, 모터, ESC, 프로펠러, 배터리, 비행제어기, 센서, 통신 HW, 페이로드, 컴패니언 컴퓨터를 한 표로.
근거 칸에는 위 자료의 문서 제목을 쓰고, 자료에 없으면 "근거 없음".)
## 2. 중량·전력 예산
총중량, 추력 대비 중량비, 소비전력, 예상 체공시간을 계산식과 함께 제시. 근거 없는 수치는 "재확인 필요".
## 3. HW 의존·호환 관계
"A --관계--> B" 형식으로 5~10줄 (관계 예: powers, controls, interfaces_with, mounted_on, requires).
각 줄 끝에 한 문장으로 그렇게 판단한 이유(추론)를 덧붙여라.
## 4. 온톨로지 보강 필요 (클래스 미정의 요소, 근거 없음으로 남은 항목)

한국어로 작성.`
}

function swSystemPrompt(manifest: string, grounding: string, c: StageContext): string {
  return `당신은 DroneWiki 소속 'SW 스펙 에이전트'다. 6단계 협업 파이프라인의 3단계를 맡는다.
승인된 기획서와 HW 스펙을 받아, 그 하드웨어 위에서 동작할 소프트웨어 스택을 구체화하는 것이 임무다.

${manifest}

<proposal>
${clip(c.proposal, 1500, "(기획서 없음)")}
</proposal>

<hw-spec>
${clip(c.hw, 4000, "(HW 스펙 없음)")}
</hw-spec>

${GROUNDING_NOTE}

${grounding}

${ONTOLOGY_CLASSES}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. SW 구성요소 표
| 구성요소 | 온톨로지 클래스 | 선정안 | 실행 위치(HW) | 요구 자원 | 근거 |
(비행 스택, 미들웨어, GCS, 인식·AI 모델, 통신 프로토콜. 실행 위치는 HW 스펙의 구성요소 이름을 그대로 써라.)
## 2. SW 의존·호환 관계
"A --관계--> B" 형식 5~10줄 (관계 예: runs_on, depends_on, publishes_to, controls, uses_protocol). 각 줄에 이유 한 문장.
## 3. HW 대비 자원 적합성
컴패니언 컴퓨터·FC의 연산·메모리·통신 대역이 SW 요구를 만족하는지 충족/위험/근거 부족으로 판정.
## 4. 온톨로지 보강 필요

한국어로 작성.`
}

function techspecSystemPrompt(manifest: string, grounding: string, c: StageContext): string {
  return `당신은 DroneWiki 소속 '기술 스펙 통합 검증 에이전트'다. 6단계 협업 파이프라인의 4단계를 맡는다.
승인된 HW 스펙과 SW 스펙을 서로 맞대어 모순·위험을 찾고, 확정 기술 스펙으로 정리하는 것이 임무다.

${manifest}

<proposal>
${clip(c.proposal, 1500, "(기획서 없음)")}
</proposal>

<hw-spec>
${clip(c.hw, 3500, "(HW 스펙 없음)")}
</hw-spec>

<sw-spec>
${clip(c.sw, 3500, "(SW 스펙 없음)")}
</sw-spec>

${GROUNDING_NOTE}

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 성능 요구와 대조
기획서의 요구(항속거리·체공시간·페이로드·통신거리 등) 3~5개를 HW·SW 선정안과 대조해 충족/위험/근거 부족으로 판정(이유 포함).
## 2. HW↔SW 인터페이스 정합표
| 연결 | HW 측 | SW 측 | 프로토콜·버스 | 정합 여부 |
## 3. 충돌·위험 목록
서로 충돌하는 요구나 선정(예: 체공시간 vs 페이로드)을 명시하고 해소 방안을 한 줄씩.
## 4. 규정 준수 요건
## 5. 확정 기술 스펙 요약
아래 10줄을 번호와 굵은 라벨 형식 그대로, 한 줄에 한 항목으로 쓴다. 값은 승인된 HW 스펙 표와 <design-calc>에 있는 것만 옮기고 새로 계산하지 마라. 표에 없는 값은 "미정"이라고 쓴다. 통합 검증 결과 HW 표의 값을 바꾸어야 하면 바꾼 값을 쓰고 위 3번 목록에 이유를 적는다.
1. **기체**: 형식 · 휠베이스 N mm
2. **모터**: 제품명 · KV N · N개
3. **ESC**: 제품명 · 연속 N A · N개
4. **프롭**: 제품명 또는 지름 N인치 · N개
5. **배터리**: 제품명 · NS · N Ah · 질량 N g
6. **총중량(AUW)**: N kg
7. **FC**: 제품명
8. **컴패니언 컴퓨터**: 제품명 또는 없음
9. **통신**: 제품명 · 대역
10. **페이로드**: N kg

한국어로 작성.`
}

function architectureSystemPrompt(manifest: string, grounding: string, c: StageContext): string {
  return `당신은 DroneWiki 소속 '아키텍처 설계 에이전트'다. 6단계 협업 파이프라인의 5단계를 맡는다.
승인된 기술 스펙을 받아 시스템 아키텍처를 설계하는 것이 임무다.

${manifest}

<proposal>
${clip(c.proposal, 1500, "(기획서 없음)")}
</proposal>

<tech-spec>
${clip(c.techspec, 3500, "(기술 스펙 없음)")}
</tech-spec>

<hw-spec>
${clip(c.hw, 2500, "(HW 스펙 없음)")}
</hw-spec>

<sw-spec>
${clip(c.sw, 2500, "(SW 스펙 없음)")}
</sw-spec>

${GROUNDING_NOTE}

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 시스템 아키텍처 개요 (\`\`\`mermaid 다이어그램 코드블록 포함, HW·SW 스펙의 의존·호환 관계를 그대로 반영)
## 2. 모듈별 책임 (모듈 | 담당 구성요소(스펙 표의 이름) | 입력 | 출력 | 사용 프로토콜·토픽)
## 3. 설계 판단 근거 (기술 스펙의 충돌·위험 항목을 아키텍처로 어떻게 해소했는지 3~5줄)

코드 스켈레톤과 로드맵은 다음 단계 에이전트가 맡으니 여기서는 쓰지 마라. 한국어로 작성.`
}

function implementationSystemPrompt(manifest: string, grounding: string, c: StageContext): string {
  return `당신은 DroneWiki 소속 '소스코드 설계 에이전트'다. 6단계 협업 파이프라인의 마지막 단계를 맡는다.
승인된 아키텍처와 기술 스펙을 받아 초기 구현 스켈레톤 코드와 개발 로드맵을 작성하는 것이 임무다.

${manifest}

<tech-spec>
${clip(c.techspec, 3000, "(기술 스펙 없음)")}
</tech-spec>

<architecture>
${clip(c.architecture, 4000, "(아키텍처 없음)")}
</architecture>

${GROUNDING_NOTE}

${grounding}

# 출력 형식 (마크다운, 이 구조를 그대로 따를 것)
## 1. 핵심 코드 스켈레톤 (아키텍처의 모듈명과 일치시킬 것, 스펙에 맞는 언어 선택, 코드블록)
## 2. 개발 로드맵 (마일스톤별 완료 기준, 기술 스펙의 위험·근거 부족 항목을 검증하는 단계를 포함)

한국어로 작성.`
}

const PROMPTS: Record<Stage, (m: string, g: string, c: StageContext) => string> = {
  proposal: (m, g) => proposalSystemPrompt(m, g),
  hw: hwSystemPrompt,
  sw: swSystemPrompt,
  techspec: techspecSystemPrompt,
  architecture: architectureSystemPrompt,
  implementation: implementationSystemPrompt,
}

// 단계별 검색 질의: 컨셉 + 직전 단계 결과 일부 + 단계 편향 키워드
function groundingQuery(stage: Stage, prompt: string, c: StageContext): string {
  const prev: Record<Stage, string | undefined> = {
    proposal: undefined,
    hw: c.proposal,
    sw: c.hw,
    techspec: `${c.hw ?? ""} ${c.sw ?? ""}`,
    architecture: c.techspec,
    implementation: c.architecture,
  }
  const excerpt = (prev[stage] ?? "").slice(0, GROUNDING_EXCERPT_CHARS)
  return `${prompt} ${excerpt} ${STAGE_QUERY_HINT[stage] ?? ""}`.trim()
}


// 추론 보강 블록(결정론): 온톨로지 규칙 엔진의 교차 공학 파급 + 지식그래프의 검증 근거. (🔮 가정·불확실성은 생성 뒤 추론 모델의 짧은 검토 호출이 쓴다)
const REASON_STAGES = new Set<Stage>(["sw", "techspec", "architecture"])
const CROSS_HINT = "진동 IMU 항법 GNSS 전원 통신 간섭 연산 발열 제어 지연 모터 ESC 배터리"
function buildReasonBlocks(stage: Stage, prompt: string, ctx: StageContext, level: "block" | "on"): string {
  if (!REASON_STAGES.has(stage)) return ""
  const parts: string[] = []
  try {
    const o = buildOntologyContext(`${prompt} ${(ctx.hw ?? "").slice(0, 600)} ${CROSS_HINT}`, undefined, { kgOnly: true })
    if (o.block) parts.push(o.block)
  } catch { /* 규칙 엔진 실패는 보강만 빠진다 */ }
  if (level === "on") try {
    const plan = planQuery(`${prompt} ${CROSS_HINT}`)
    const lines = plan.claims.filter((c) => c.origin !== "wiki" && (c.status === "verified" || c.status === "sourced")).slice(0, 8).map((c) => `- ${c.subjectText || c.subject} · ${c.predicate}: ${c.value} (${c.status})`)
    if (lines.length) parts.push(`<kg-evidence>\n지식그래프의 검증·출처확인 claim(사실 근거). 이 값은 그대로 인용하고 바꾸지 마라.\n${lines.join("\n")}\n</kg-evidence>`)
  } catch { /* 지식 DB 미적재 시 생략 */ }

  return `\n\n${parts.join("\n\n")}`
}

// 추론 모델 검토(짧은 호출): 완성된 단계 결과에서 설계가 의존하는 가정·미확정 위험을 최대 4줄로 뽑는다. 장문 생성에는 쓰지 않는다(추론 체인은 장문에서 느림).
// 서버 가드: 줄마다 등급 표기 필수, 근거 문서(본문·계산 블록·질문)에 없는 숫자가 들어간 줄은 버린다.
async function reasonReview(stage: Stage, prompt: string, text: string, calc: string): Promise<string> {
  const r = streamText({
    model: wikiModel("reason"),
    system: `당신은 드론 설계 검토자다. 아래 <design>의 단계 결과가 의존하는 가정과 아직 확정되지 않은 위험을 최대 4줄로 쓴다. 형식: "- (내용) — 가능성 낮음|중간|높음". 규칙: <design>·<calc>에 있는 내용에서 직접 이어지는 것만 쓰고, 새 숫자·퍼센트·제품 사양을 만들지 않는다. 법규·안전 기준 값은 쓰지 않는다. 설명·머리말 없이 줄만 출력한다.`,
    prompt: `<concept>${prompt.slice(0, 600)}</concept>\n<stage>${stage}</stage>\n<calc>${calc.slice(0, 1500)}</calc>\n<design>${text.slice(0, 3500)}</design>`,
    maxOutputTokens: 900,
    abortSignal: AbortSignal.timeout(45_000),
  })
  const raw = (await r.text).trim()
  const allowed = new Set((`${text} ${calc} ${prompt}`.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => String(parseFloat(n.replace(",", ".")))))
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => /^[-•*]/.test(l) && /가능성\s*(낮음|중간|높음)/.test(l))
    .filter((l) => (l.match(/\d+(?:[.,]\d+)?/g) ?? []).every((n) => String(parseFloat(n.replace(",", "."))) !== "NaN" && (allowed.has(String(parseFloat(n.replace(",", "."))))|| /^\d$/.test(n))))
    .slice(0, 4)
  console.info(`[builder] reasonReview stage=${stage} rawLines=${raw.split("\n").filter((l) => l.trim()).length} kept=${lines.length}`)
  return lines.length ? `\n\n## 🔮 가정·불확실성(추론 — 사실이 아니며 재확인 필요)\n${lines.map((l) => l.replace(/^[•*]/, "-")).join("\n")}` : ""
}

function feedbackBlock(c: StageContext): string {
  const reason = (c.feedback?.reason ?? "").trim().slice(0, 1000)
  const previous = (c.feedback?.previous ?? "").trim().slice(0, 6000)
  if (!previous && !reason) return ""
  return `\n\n# 반려 피드백 (검토자가 직전 결과를 반려했다)
<previous-output>
${previous || "(없음)"}
</previous-output>
반려 사유: ${reason || "(사유 미기재 — 직전 결과의 부족한 점을 스스로 보완해라)"}
위 사유를 반영해 이 단계 결과를 처음부터 다시 작성하되, 문제 없는 부분은 유지하고 출력 형식은 그대로 따라라.`
}

// AI를 부르지 않는 서버 즉답(재질문·불가 판정). 클라이언트는 isGateStopText로 일반 결과와 구분한다.
function instantReply(text: string): Response {
  const id = "gate"
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start" })
        writer.write({ type: "text-start", id })
        writer.write({ type: "text-delta", id, delta: text })
        writer.write({ type: "text-end", id })
        writer.write({ type: "finish" })
      },
    }),
  })
}

export async function POST(req: NextRequest) {
  const { prompt, stage, context, modelTier, reason, cross }: { prompt: string; stage: Stage; context?: StageContext; modelTier?: string; reason?: string; cross?: string } = await req.json()
  // 교차 공학 규칙(2026-10-24): strict = 위반 시 기존 재작성 경로(쌍 비교에서 느려져 기본 꺼짐), advisory = 단계 끝에 규칙 기반 점검표만 붙임(지연 0, 기본 켜짐). off로 끌 수 있다(요청 cross 또는 BUILDER_CROSS).
  const crossMode = cross ?? process.env.BUILDER_CROSS ?? "advisory"
  const crossOn = crossMode === "strict"
  const crossAdvisoryOn = crossMode === "advisory" || crossMode === "strict"
  // 추론 보강(교차 공학 추론 블록 + 🔮 가정·불확실성 + 추론 모델 체인)은 기본 꺼짐. 요청의 reason(on|off)이 우선, 없으면 BUILDER_REASON=on일 때만 켠다. 켜도 6단계 구조·응답 형식은 같다.
  // 수준: off | block(온톨로지 규칙 추론 블록만, 모델 호출 추가 없음) | on(블록 + 지식그래프 근거 + 추론 모델 검토)
  const level = (reason === "on" || reason === "block" || reason === "off" ? reason : process.env.BUILDER_REASON) ?? ""
  const reasonLevel: "off" | "block" | "on" = level === "on" ? "on" : level === "block" ? "block" : "off"
  const reasonMode = reasonLevel === "on"
  // 초안은 작은 모델(chat 체인), 서버 검증 위반이 나올 때만 큰 모델(builder 체인)로 재작성한다. 요청의 modelTier(cascade|deep)가 우선, 없으면 BUILDER_TIER=cascade일 때만 켠다.
  const cascade = modelTier === "cascade" || (modelTier !== "deep" && process.env.BUILDER_TIER === "cascade")

  if (!prompt?.trim()) {
    return new Response("concept required", { status: 400 })
  }
  if (!(stage in STAGE_LIMITS)) {
    return new Response("unknown stage", { status: 400 })
  }

  // 설계 입력 게이트(모든 단계 공통): 필수 4항목이 없으면 AI를 부르지 않고 재질문하고, 물리적으로 성립하지 않으면
  // "추론상 불가"로 멈춘다. 통과하면 엔진 계산(<design-calc>)을 확정 전제로 각 단계 프롬프트에 넣는다.
  // 논문 구성 재현 모드: 사용자가 논문/기체를 지목했으면 논문이 보고한 값으로 빈 필수 입력을 채워 게이트에 넘긴다.
  const paper = matchPaperConfig(prompt)
  const gate = evaluateBuilderGate(paper ? `${prompt} ${specHint(paper, parseSpec(prompt))}` : prompt)
  if (gate.reply) return instantReply(gate.reply)

  const ctx = context ?? {}
  const grounding = buildGroundingBlock(groundingQuery(stage, prompt, ctx))
  const manifest = await buildAgentManifest()

  // 멀티로터면 엔진 계산에 맞는 실제 제품 후보(제조사 공식 사양 수집본)를 서버가 골라 확정 전제로 넣는다.
  const match = gate.spec.platform === "multirotor" && stage !== "proposal" ? matchProducts(gate.spec) : null
  const productMatch = match?.block ?? ""
  // 추론 보강: SW·기술스펙·아키텍처 단계에 (a) 온톨로지 규칙이 계산한 교차 공학 파급, (b) 지식그래프 검증 근거, (c) 🔮 가정·불확실성 작성 지침을 서버가 주입한다.
  const reasonBlocks = reasonLevel !== "off" ? buildReasonBlocks(stage, prompt, ctx, reasonLevel) : ""
  // 논문 근거 적용: 서버가 지식그래프의 논문 claim을 단계 주제·설계 문서와 맞춰 고르고, 프롬프트에 주입하며 결과 끝에 출처 표를 붙인다(모델이 인용하지 않아도 공개).
  let picks: ReturnType<typeof selectPaperClaims> = []
  if (stage !== "proposal" && stage !== "implementation" && !paper) {
    try { picks = selectPaperClaims(stage, gate.spec, `${prompt} ${ctx.hw ?? ""}`) } catch { /* 선택 실패는 근거만 빠진다 */ }
  }
  const system = PROMPTS[stage](manifest, grounding, ctx) + `\n\n${gate.block ?? ""}\n${gate.calc ?? ""}\n${productMatch}${paper ? `\n${paperBlock(paper)}` : ""}` + reasonBlocks + (picks.length ? `\n\n${paperEvidenceBlock(picks)}` : "") + feedbackBlock(ctx)
  const limit = STAGE_LIMITS[stage]
  const fullSystem = (extra = "") => `${system}${extra}\n\n# 분량 제한\n전체 ${limit.chars}자 이내로 간결하게 작성하고, 표·목록은 핵심만 담아라. 코드 스켈레톤은 모듈당 15줄 이내로 제한해라.`

  // 검증 모드(멀티로터 2~6단계): 쓰기 → 코드 검증 → 위반 시 1회 재작성 → 결과 끝에 검증 결과 공개.
  // 첫 글자는 검증 뒤에 나가므로 느리지만(최대 2회 생성), 출력의 규칙 위반을 서버가 보증/공개한다.
  if (match?.data) {
    const data = match.data
    const validate = (text: string): Validation => {
      const base = validateCore(text)
      if (!crossOn || !(stage === "sw" || stage === "techspec" || stage === "architecture")) return base
      const x = crossChecks(stage, text, ctx.hw ?? "")
      return { checks: [...base.checks, ...x.checks], issues: [...base.issues, ...x.issues] }
    }
    const validateCore = (text: string): Validation => {
      switch (stage) {
        case "hw": {
          const v = validateHw(text, data, paper ? (sel) => isPaperComponent(sel, paper) : undefined)
          if (!paper) return v
          const pv = validatePaperConfig(text, paper)
          return { checks: [...pv.checks, ...v.checks], issues: [...pv.issues, ...v.issues] }
        }
        case "sw": return validateSw(text, ctx.hw ?? "")
        case "techspec": return validateTechspec(text, ctx.hw ?? "", data)
        case "architecture": return validateArchitecture(text, ctx.hw ?? "", data)
        default: return validateImplementation(text, ctx.architecture ?? "")
      }
    }
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: "start" })
          // 첫 글자는 검증 뒤에 나가므로, 진행 단계를 먼저 흘려 화면이 멈춘 것처럼 보이지 않게 한다(알 수 없는 type은 구형 클라이언트가 무시).
          const t0 = Date.now()
          const progress = (phase: string, detail?: string) => writer.write({ type: "data-progress", data: { phase, detail, elapsedSec: Math.round((Date.now() - t0) / 1000) }, transient: true })
          try {
            // 한 번의 생성에 시간 상한을 둔다(NVIDIA 지연 꼬리 205초 사례). 상한에 닿으면 모델 체인이 다음 모델로 넘어간다.
            const gen = async (extra: string, profile: "chat" | "builder" | "reason" = "builder") => {
              const r = streamText({ model: wikiModel(profile), system: fullSystem(extra), maxOutputTokens: limit.maxOutputTokens, prompt: `드론 컨셉: ${prompt}`, abortSignal: AbortSignal.timeout(GEN_TIMEOUT_MS) })
              return (await r.text).trim()
            }
            progress("writing")
            let text = await gen("", cascade ? "chat" : "builder")
            progress("validating")
            let v = validate(text)
            let retried = false
            // 재작성은 남은 시간이 충분할 때만 한다(전체 예산 초과 시 위반을 그대로 공개).
            if (v.issues.length && Date.now() - t0 < REWRITE_DEADLINE_MS) {
              retried = true
              progress("rewriting", `${v.issues.length}건 위반`)
              const fix = `\n\n# 서버 검증 위반 (코드가 판정한 사실 — 반드시 고쳐서 다시 쓴다)\n<previous-output>\n${text.slice(0, 6000)}\n</previous-output>\n${v.issues.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n위 위반을 모두 해소해 이 단계 결과를 처음부터 다시 작성하되, 위반이 아닌 부분은 유지하고 출력 형식은 그대로 따른다.`
              try {
                const second = await gen(fix, "builder")
                if (second) { text = second; v = validate(text) }
              } catch { /* 재작성 실패·시간 초과: 1차 결과로 계속 */ }
            }
            // 그래도 남은 'HW 카탈로그 밖 선정'은 코드가 직접 치환하고 그 사실을 공개한다.
            let repairNote = ""
            if (stage === "hw" && v.issues.some((x) => x.startsWith("카탈로그 후보에 없는 제품"))) {
              progress("repairing")
              const rep = repairHwSelections(text, data, paper ? (sel) => isPaperComponent(sel, paper) : undefined)
              if (rep.repaired.length) {
                text = rep.md
                v = validate(text)
                repairNote = `\n\n> 서버 치환 ${rep.repaired.length}건 (모델이 카탈로그 밖 제품을 골라 코드가 바꿈): ${rep.repaired.join(" ; ")}`
              }
            }
            let reviewNote = ""
            if (reasonMode && REASON_STAGES.has(stage) && Date.now() - t0 < 140_000) {
              progress("reasoning")
              try { reviewNote = await reasonReview(stage, prompt, text, `${gate.calc ?? ""}`) } catch { /* 검토 실패·시간 초과는 생략한다(본문은 이미 완성) */ }
            }
            const advisory = crossAdvisoryOn && (stage === "sw" || stage === "techspec" || stage === "architecture") ? crossAdvisory(stage, text, ctx.hw ?? "") : ""
            // 서버 계산 게이트(코드 계산): HW·기술스펙 단계 끝에 물리량을 코드가 다시 계산한 결과를 붙인다. 실패해도 본문은 그대로 나간다.
            let gateNote = ""
            if (stage === "hw" || stage === "techspec") {
              try { gateNote = buildGateNote({ spec: gate.spec, hwMd: stage === "hw" ? text : ctx.hw ?? "", compareText: `${ctx.hw ?? ""}\n${text}`, finalSpecMd: stage === "techspec" ? text : ctx.techspec }) } catch { /* 게이트 실패는 보강만 빠진다 */ }
            }
            const paperNote = stage !== "proposal" && stage !== "implementation" && !paper ? paperEvidenceNote(picks, text) : ""
            // 단계 간 일치성: 기준은 HW 표(4단계 확정 스펙 구역이 생기면 그것이 우선). HW 단계는 기획과, 이후 단계는 HW 표와 비교한다.
            let consistencyNote = ""
            try {
              if (stage === "hw" && ctx.proposal) consistencyNote = stageConsistencyNote(text, ctx.proposal, "기획 단계")
              else if (stage !== "hw" && stage !== "proposal" && ctx.hw) consistencyNote = stageConsistencyNote(ctx.hw, text, `${stage === "sw" ? "SW" : stage === "techspec" ? "기술 스펙" : stage === "architecture" ? "아키텍처" : "구현"} 단계`, stage === "architecture" || stage === "implementation" ? ctx.techspec : undefined)
            } catch { /* 점검 실패는 보강만 빠진다 */ }
            const out = soften(text + repairNote + reviewNote + advisory + renderValidation(v, retried) + consistencyNote + gateNote + paperNote)
            progress("done")
            const id = "stage"
            writer.write({ type: "text-start", id })
            // 600자씩 나누되 이모지(서로게이트 쌍) 중간에서 자르지 않는다
            for (let i = 0; i < out.length;) {
              let end = Math.min(out.length, i + 600)
              const last = out.charCodeAt(end - 1)
              if (end < out.length && last >= 0xd800 && last <= 0xdbff) end++
              writer.write({ type: "text-delta", id, delta: out.slice(i, end) })
              i = end
            }
            writer.write({ type: "text-end", id })
            writer.write({ type: "finish" })
          } catch (e) {
            writer.write({ type: "error", errorText: e instanceof Error ? e.message : "AI 생성 중 오류가 발생했습니다." })
          }
        },
      }),
    })
  }

  const result = streamText({
    model: wikiModel("builder"),
    system: fullSystem(),
    maxOutputTokens: limit.maxOutputTokens,
    prompt: `드론 컨셉: ${prompt}`,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        if (error instanceof Error) return error.message
        return "AI 생성 중 오류가 발생했습니다."
      },
    }),
  })
}
