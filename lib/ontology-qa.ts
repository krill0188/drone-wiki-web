import fs from "fs"
import path from "path"
import relationsFile from "@/data/ontology/relations.json"
import { loadGraph } from "./rag"
import { getAncestors, getDescendants, loadHierarchy } from "./ontology"

// 온톨로지 우선 Q&A(2026-10-16): 질문을 먼저 온톨로지 클래스로 해석하고, 클래스 계층·
// 클래스 간 관계를 구조로 제공한 뒤 위키 문서를 "근거"로 붙인다. 논문·뉴스 문서를
// 규칙으로 개체(Motor 등)에 분류하지 않고, 문서는 클래스와의 "연관"으로만 취급한다.

function resolveWikiRoot() {
  const envPath = process.env.WIKI_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const local = path.join(process.env.HOME || "", "2nd")
  if (fs.existsSync(local)) return local
  return path.join(process.cwd(), "data", "wiki")
}

interface Relation {
  rel: string
  label: string
  domain: string
  range: string
  inverse?: string
  source: "spec" | "hw-ext"
}
const RELATIONS: Relation[] = (relationsFile as { relations: Relation[] }).relations

// 클래스 별칭(한/영) — 첫 매칭이 아니라 매칭되는 모든 클래스를 수집한다.
const ALIASES: [string, RegExp][] = [
  ["Propeller", /propeller|프로펠러|\bprops?\b/i],
  ["ESC", /\besc\b|speed.?controller|전자.?변속|변속기/i],
  ["Motor", /\bmotors?\b|bldc|모터|\bkv\b|전동기/i],
  ["Battery", /batter|배터리|lipo|li-?ion|fuel.?cell|연료전지|전원|\bcells?\b|셀/i],
  ["Gimbal", /gimbal|짐벌/i],
  ["LiDAR", /lidar|라이다/i],
  ["Camera", /camera|카메라|\beo\/ir\b|열화상|thermal/i],
  ["IMU", /\bimu\b|관성/i],
  ["GNSS", /gnss|\bgps\b|\brtk\b|위성항법/i],
  ["Barometer", /barometer|기압/i],
  ["Magnetometer", /magnetometer|compass|지자기|나침반/i],
  ["FlightController", /flight.?controller|pixhawk|\bfc\b|비행.?제어.?(기|컴퓨터|보드)/i],
  ["CompanionComputer", /companion|jetson|raspberry|엣지.?컴퓨|온보드.?컴퓨/i],
  ["PX4", /\bpx4\b/i],
  ["ArduPilot", /ardupilot/i],
  ["ROS2", /\bros ?2\b|\bros\b/i],
  ["Datalink", /datalink|data.?link|telemetry.?radio|c2.?link|데이터.?링크|통신.?링크|텔레메트리|영상.?전송|elrs|mavlink/i],
  ["Payload", /payload|페이로드|살포|winch|탑재.?장비/i],
  ["Frame", /\bframe\b|프레임|airframe|기체.?구조|\bchassis\b/i],
  ["Multirotor", /multirotor|quadcopter|quadrotor|hexacopter|멀티콥터|쿼드콥터|멀티로터|쿼드로터/i],
  ["FixedWing", /fixed.?wing|고정익/i],
  ["VTOL", /\bvtol\b|틸트로터/i],
  ["LLM", /\bllm\b|large language|거대.?언어/i],
  ["SLM", /\bslm\b|small language|소형.?언어/i],
  ["PerceptionModel", /yolo|object.?detect|객체.?탐지|segmentation|slam|perception|인식/i],
  ["SwarmCoordinator", /swarm|군집|formation|편대/i],
  ["MissionPlan", /mission.?plan|임무.?계획|경로.?계획|path.?plan/i],
  ["Mission", /\bmission\b|임무|점검|방제|감시|배송/i],
  ["Drone", /\bdrone\b|\buav\b|드론|무인기|기체/i],
]

// 기체 설계 질문 신호 — 이 경우 클래스 간 필수 연결(구동계·전원계)을 1홉 더 보여준다.
const DESIGN_HINT = /설계|구성|선정|선택|사양|스펙|호환|매칭|조합|추천|design|spec|select|sizing/i

export interface OntologyContext {
  block: string
  classes: string[]
}

function detectClasses(text: string, known: Record<string, string | null>): string[] {
  const found: string[] = []
  for (const [cls, rx] of ALIASES) {
    if (cls in known && rx.test(text)) found.push(cls)
  }
  if (!found.includes("Battery") && "Battery" in known && /\b\d{1,2}s(\d{1,2}p)?\b/i.test(text)) found.push("Battery")
  // 'Drone'만 걸린 경우는 정보가 약하므로 다른 클래스가 있으면 제외
  return found.length > 1 ? found.filter((c) => c !== "Drone") : found
}

function relationLines(classes: string[], hierarchy: Record<string, string | null>, wide: boolean) {
  const set = new Set(classes)
  // 서브클래스는 부모 정의를 상속해 매칭한다(예: Motor ⊑ Actuator → Drone hasActuator Motor).
  const lineage = (c: string) => [c, ...getAncestors(c, hierarchy)]
  const seen = new Set<string>()
  const lines: string[] = []
  for (const r of RELATIONS) {
    // 관련 클래스 쌍 우선: 도메인·레인지 양쪽이 모두 질문 클래스 계열일 때
    const dIn = classes.some((c) => lineage(c).includes(r.domain))
    const rIn = classes.some((c) => lineage(c).includes(r.range))
    const both = dIn && rIn
    if (!(both || (wide && (dIn || rIn)))) continue
    // Drone을 끼는 관계는 질문 클래스가 Drone 자신이 아니면 설계 질의가 아닐 때 생략
    if (!wide && (r.domain === "Drone" || r.range === "Drone") && !set.has("Drone")) continue
    const key = `${r.domain}|${r.rel}|${r.range}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`- ${r.domain} --[${r.rel}]--> ${r.range} (${r.label}${r.source === "hw-ext" ? "; 설계 관계·구조 정의" : ""})`)
  }
  return lines.slice(0, 18)
}

function classDocs(classes: string[], limit = 3): string[] {
  const { nodes } = loadGraph()
  const lines: string[] = []
  for (const cls of classes.slice(0, 5)) {
    const rx = ALIASES.find(([c]) => c === cls)?.[1]
    if (!rx) continue
    const hits = nodes
      .map((n) => {
        const tags = ((n as unknown as { tags?: string[] }).tags ?? []).join(" ")
        const hay = `${n.id} ${n.name} ${tags}`
        if (!rx.test(hay)) return null
        let score = 0
        if (rx.test(n.name)) score += 2
        if (n.domain === "hardware") score += 2
        if (/catalog|카탈로그|specs?/i.test(n.id)) score += 2
        if (n.domain === "ops-mission") score -= 2
        return { n, score }
      })
      .filter((x): x is { n: (typeof nodes)[number]; score: number } => !!x && x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    if (hits.length) lines.push(`- ${cls}: ${hits.map((h) => `${h.n.name} (${h.n.id})`).join(" · ")}`)
  }
  return lines
}

export function buildOntologyContext(question: string, docTitle?: string): OntologyContext {
  const hierarchy = loadHierarchy(resolveWikiRoot())
  if (Object.keys(hierarchy).length === 0) return { block: "", classes: [] }
  const text = `${docTitle ?? ""} ${question}`
  const classes = detectClasses(text, hierarchy)
  if (classes.length === 0) return { block: "", classes: [] }

  const wide = DESIGN_HINT.test(question)
  const hierLines = classes
    .slice(0, 6)
    .map((c) => {
      const chain = [c, ...getAncestors(c, hierarchy)].join(" ⊑ ")
      const kids = getDescendants(c, hierarchy).slice(0, 8)
      return `- ${chain}${kids.length ? `  (하위: ${kids.join(", ")})` : ""}`
    })
  const rels = relationLines(classes, hierarchy, wide)
  const docs = classDocs(classes)

  const block = `<ontology>
질문을 온톨로지로 해석한 결과 — 답변의 뼈대로 사용할 것.
관련 클래스: ${classes.join(", ")}
클래스 계층:
${hierLines.join("\n")}
${rels.length ? `클래스 간 관계(구조 정의 — 개별 제품·수치의 사실이 아님):\n${rels.join("\n")}\n` : ""}${docs.length ? `클래스와 연관된 위키 문서(자동 연결, 근거 확인용):\n${docs.join("\n")}\n` : ""}</ontology>`
  return { block, classes }
}
