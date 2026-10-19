import cfgFile from "@/data/ontology/paper-configs.json"
import type { DesignSpec } from "./design-gate"
import type { Check, Validation } from "./stage-validate"

// 논문이 직접 밝힌 기체 구성(data/ontology/paper-configs.json, 인용문은 원문 PDF와 대조됨)을 그대로 쓰는 "논문 구성 재현" 모드.
// 사용자가 논문/기체 이름을 지목했을 때만 켜지고, 구성품은 바꾸지 않으며 구성 밖 항목만 제조사 카탈로그로 보완한다(융합).
export interface PaperComponent { category: string; name: string; keyTokens: string[]; quote: string }
export interface PaperConfig {
  id: string; name: string; aliases: string[]; rotors: number
  source: { id: string; title: string; url: string }
  reported: { weightKg?: number; flightMin?: number; flightMinWithPayload?: number; wheelbaseMm?: number; propIn?: number; batteryWh?: number; payloadKg?: number }
  reportedQuote: string
  components: PaperComponent[]
}
const CONFIGS = cfgFile.configs as PaperConfig[]

const PAPER_CUE = /논문|paper|arxiv|mrs|재현|그대로|race against/i
const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "")

// 별칭이 있고 논문/재현 맥락이 함께 있을 때만 켠다(일반 제품 질문 "X500 프레임 추천"과 구분).
export function matchPaperConfig(concept: string): PaperConfig | null {
  const t = concept.toLowerCase()
  if (!PAPER_CUE.test(concept)) return null
  return CONFIGS.find((c) => c.aliases.some((a) => t.includes(a))) ?? null
}

// 사용자가 이미 준 항목은 건드리지 않고, 비어 있는 필수 입력 중 논문이 보고한 값만 게이트 입력에 보탠다. 비행시간은 논문이 페이로드와 연결해 말한 값만 쓰고, 비행거리는 논문에 없어 사용자에게 묻는다.
export function specHint(cfg: PaperConfig, parsed: DesignSpec): string {
  const r = cfg.reported, parts: string[] = [`${cfg.rotors === 4 ? "쿼드콥터" : `${cfg.rotors}로터`}`]
  if (parsed.payloadKg === undefined && r.payloadKg !== undefined) parts.push(`페이로드 ${r.payloadKg}kg`)
  if (parsed.sizeMm === undefined && r.wheelbaseMm !== undefined) parts.push(`휠베이스 ${r.wheelbaseMm}mm`)
  if (parsed.flightMin === undefined && r.flightMinWithPayload !== undefined) parts.push(`비행시간 ${r.flightMinWithPayload}분`)
  return parts.join(" ")
}

export function paperBlock(cfg: PaperConfig): string {
  const r = cfg.reported
  const rep = [r.weightKg != null && `기체 무게 ${r.weightKg}kg`, r.wheelbaseMm != null && `축거 ${r.wheelbaseMm}mm`, r.propIn != null && `프롭 ${r.propIn}인치`, r.batteryWh != null && `배터리 ${r.batteryWh}Wh`, r.flightMin != null && `표 비행시간 ${r.flightMin}분(탑재 조건 불명)`, r.flightMinWithPayload != null && `페이로드 만재 시 비행시간 ${r.flightMinWithPayload}분(본문)`, r.payloadKg != null && `페이로드 ${r.payloadKg}kg`].filter(Boolean).join(", ")
  return `<paper-config>
사용자가 논문 구성을 지목했다. 아래는 논문 원문에서 직접 확인된 구성이다(출처: ${cfg.source.title}, ${cfg.source.url}).
기체: ${cfg.name}
논문 보고 성능: ${rep || "없음"} (논문 표기 조건 그대로이며 우리 계산의 결과가 아니다)
논문 구성품:
${cfg.components.map((c, i) => `${i + 1}. [${c.category}] ${c.name} — 원문: "${c.quote}"`).join("\n")}
[규칙]
- 위 구성품은 이름·모델·사양을 바꾸지 말고 그대로 쓰고, 근거 칸에 "논문 ${cfg.source.id}"를 적는다.
- 논문에 없는 분류(예: ESC, 링크, 페이로드)만 <product-match> 후보로 보완하고, 근거 칸에 제조사 URL을 적는다. 후보가 없으면 '카탈로그 후보 없음 — 확인 필요'.
- 논문 구성과 엔진 계산(<design-calc>)이 어긋나면 논문 값을 고치지 말고 어긋난 항목과 크기를 표 아래에 그대로 공개한다. 논문 구성이 "틀렸다"고 단정하지 않는다(논문의 시험 조건을 모른다).
</paper-config>`
}

// HW 표가 논문 구성품을 그대로 담았는지 검사: 구성품마다 keyTokens가 모두 표에 있어야 한다.
export function validatePaperConfig(hwMd: string, cfg: PaperConfig): Validation {
  const text = norm(hwMd)
  const missing = cfg.components.filter((c) => !c.keyTokens.every((k) => text.includes(norm(k))))
  const checks: Check[] = [{ ok: missing.length === 0, label: `논문 구성품 ${cfg.components.length}개가 HW 표에 그대로 있음 (${cfg.source.id})`, detail: missing.length ? `누락/변경: ${missing.map((c) => c.name).join(" / ")}` : undefined }]
  const issues = missing.length ? [`논문 구성품이 표에 없거나 바뀌었다: ${missing.map((c) => `[${c.category}] ${c.name}`).join(", ")}. 논문 구성은 그대로 쓴다.`] : []
  return { checks, issues }
}

// 선정안 문자열이 논문 구성품 중 하나인지(검증기의 "카탈로그 밖 제품" 예외 판정용)
export function isPaperComponent(selection: string, cfg: PaperConfig): boolean {
  const t = norm(selection)
  return cfg.components.some((c) => c.keyTokens.every((k) => t.includes(norm(k))))
}
