import { streamText } from "ai"
import { wikiModel } from "./ai-model"
import { all } from "./kdb"
import { planQuery, REGULATORY, type Plan } from "./kg-plan"

// 라벨된 일반 공학 설명 계층(설계: docs/ai-qa-improvement-plan.md §3). KG_GENERAL=1일 때만 쓴다(기본 off).
//
// 원칙
//  - 근거 기반 본문은 이 모듈이 건드리지 않는다. 본문 뒤에 붙는 '별도 블록'이며 별도 모델 호출로 만든다.
//  - 사실 근거가 아니다: 항상 "위키·지식그래프 근거 아님 · 재확인 필요"를 붙이고 인용 표기는 없다.
//  - 안전·법규·제품 사양·수치 질문에서는 켜지 않는다(차단 목록). 모델이 쓴 문장은 코드가 검증하고, 하나라도 어기면 블록 전체를 버린다.

export const generalTierEnabled = () => process.env.KG_GENERAL === "1"

// 범위는 '원인 후보' 나열 하나로 좁혔다(2026-10-27 실모델 평가 E4, 통과 25건 전수 열람: 사실 오류·깨진 용어 5건 = 20%).
//  - 절차형(캘리브레이션·설정 방법): 모터가 도는 실작업 절차를 일반 지식으로 답하면 틀리거나 안전 사항(프로펠러 제거 등)이 빠진다.
//  - 정의형('~가 뭐야'): 프로펠러 피치·오프보드 제어 등 정밀한 정의를 소형 무료 모델이 틀렸다(오류 5건 중 4건). 정의는 위키 기초 개념 문서 보강(지식 쪽)으로 해결한다.
//  - '점검 순서': 지어낸 메뉴 이름·말이 안 되는 절차가 나왔다. 원인 후보 범주만 낸다.
export type Kind = "cause"
export interface Eligibility { eligible: boolean; kind?: Kind; reason: string }
export type GeneralStatus = "shown" | "rejected" | "skipped"
export interface GeneralTierResult { status: GeneralStatus; reason: string; kind?: Kind; text?: string; ms?: number }

// ── 차단 목록: 이 중 하나라도 걸리면 일반 지식을 쓰지 않는다 ──
// 비행 안전·가능 여부 판단(틀리면 사고), 법규·제도, 제품·가격·추천, 수치·계산(what-if)은 근거 기반 경로 또는 결정론 엔진의 몫이다.
const BLOCK: { name: string; re: RegExp }[] = [
  { name: "안전·비행 가능 판단", re: /안전|위험|괜찮|날려도|날려 ?도|날 ?수 ?있|비행(해도| ?가능| ?할 ?수| ?금지)|이륙(해도| ?가능)|풍속|바람|기상|강풍|비바람|허용/ },
  // 안전 치명 상황(화재·부풀음·추락·사고): 원인 목록만 나가고 '사용 중단' 같은 경고는 이 계층이 낼 수 없으므로 켜지 않는다(2026-10-27 평가에서 리포 배터리 부풀음 질문 열람 중 확인).
  { name: "안전 치명 상황", re: /발화|화재|폭발|연기|불이|불꽃|스파크|부풀|부푼|팽창|감전|추락|충돌|사고|다쳤|부상|파손|떨어졌|낙하/ },
  { name: "법규·제도", re: new RegExp(`${REGULATORY.source}|보험|수출|세금|관세|인증|면허|사업자|처벌|규제`) },
  { name: "제품·가격·추천", re: /사양|스펙|가격|얼마|비용|추천|제품|모델명|브랜드|어느 ?회사|vs\.?|비교/i },
  { name: "수치·계산", re: /몇|얼마나|수치|두 ?배|배가|늘리면|줄이면|바꾸면|충분한가|계산|공식/ },
]
// 소프트웨어·프로토콜·부품 계열 이름에 붙은 숫자(PX4·ROS2·EKF2·Wi-Fi 5…)는 수량이 아니므로 숫자 차단 전에 지운다. 제품 모델(Pixhawk 6X·MN5008)은 지우지 않는다.
const NAME_DIGITS = /\b(px4|ros ?2|ekf ?2|mavlink ?2|esp32|stm32|wi-?fi ?\d?|[345]g|[23]d|6 ?dof|802\.11\w*)\b/gi

const KIND: { kind: Kind; re: RegExp }[] = [
  { kind: "cause", re: /원인|이유|뜨는|에러|오류|안 ?돼|안 ?되|끊겨|끊김|쏠려|쏠림|과열|떨림|떨리|진동|흔들|불안정|튀어|이상|고장|증상|밀려|재부팅/ },
]

// 드론 도메인 보호. 계획기가 거절했을 때(근거 없음·주제어 누락) 질문이 드론 도메인인지는 **강한 드론 어휘**로만 확인한다.
// '배터리·센서·모터' 같은 일반 하드웨어 단어는 스마트폰·자동차 질문에도 나오므로 단독으로는 도메인 근거가 아니다.
// (계획기의 '주제어 누락 거절'에 기대지 않는 이유: 한국어 활용 동사 어간('멈추'·'꺼지'·'뜨거워지')이 주제어로 남아 정상 질문이 대량 스킵된다 — 2026-10-27 평가에서 20개 중 14개.)
const DRONE_STRONG = /드론|uav|무인기|멀티콥터|쿼드|헥사|옥토|기체|프로펠러|프롭|비행 ?컨트롤러|\bfc\b|변속기|\besc\b|짐벌|호버|이륙|착륙|비행 ?중|텔레메트리|fpv|영상 ?전송|px4|ardupilot|ekf|리포|조종기|송신기|수신기|컴퍼스|나침반|캘리브레이션/i

export function blockedBy(question: string): string | null {
  for (const b of BLOCK) if (b.re.test(question)) return b.name
  if (/\d/.test(question.replace(NAME_DIGITS, " "))) return "수치·계산(숫자 포함)"
  return null
}
export function kindOf(question: string): Kind | undefined {
  return KIND.find((k) => k.re.test(question))?.kind
}

const NO_EVIDENCE = /연결된 온톨로지 개체·관계·claim, 출처가 확인된 위키 문서가 없습니다/
const MISSING_CORE = /주제를 직접 다루는 문서를 갖고 있지 않아/ // 거절 사유 구분용(도메인 판정에는 쓰지 않는다)

// 질문과 계획만으로 자격을 판정한다(본문 답변 내용에 의존하지 않는다 — 엔드포인트가 서버에서 다시 판정할 수 있게).
export function eligibility(question: string, plan: Plan): Eligibility {
  const blocked = blockedBy(question)
  if (blocked) return { eligible: false, reason: `차단: ${blocked}` }
  if (plan.entities.some((e) => e.attributes.category)) return { eligible: false, reason: "차단: 제품 개체 연결" }
  const kind = kindOf(question)
  if (!kind) return { eligible: false, reason: "질문 유형 아님(정의·원인·점검만)" }
  if (plan.status === "ready") return { eligible: true, kind, reason: "계획기 통과" }
  const why = plan.limitations.join(" ")
  if (!NO_EVIDENCE.test(why) && !MISSING_CORE.test(why)) return { eligible: false, reason: "계획기 거절(알 수 없는 사유)" }
  if (DRONE_STRONG.test(question)) return { eligible: true, kind, reason: "계획기 거절 + 강한 드론 어휘" }
  return { eligible: false, reason: "강한 드론 어휘 없음(도메인 미확인)" }
}

// 본문이 질문의 관점을 '찾지 못했다'고 한 경우(근거 기반 본문의 공백). 상태 값(answered)은 이 사실을 담지 못하므로 문구로 판정한다.
export function hasCoverageGap(limitations: string[] | undefined, text: string): boolean {
  if (limitations?.some((l) => /해당하는 내용은 선택된 근거에서 찾지 못했습니다/.test(l))) return true
  return /확인할 수 없습니다|찾지 못했습니다|근거가 없습니다|명시된 내용은 없습니다|설명은 없습니다/.test(text)
}

// ── 모델 출력 검증(코드가 판정) ──
const NUM_WORD = /(수십|수백|수천|몇십|몇백|[일이삼사오육칠팔구십백천만]\s?(퍼센트|배|분|초|미터|킬로|와트|볼트|암페어|헤르츠|도\b))/
const ASSERT = /반드시|확실히|항상|절대|문제없|문제 없|보장|안전합니다|안전하게 비행|틀림없|무조건/
const EXTRA_NAMES = ["ardupilot", "betaflight", "pixhawk", "px4", "holybro", "dji", "skydio", "mission planner", "qgroundcontrol", "inav", "kakute", "cuav", "hobbywing", "t-motor", "tmotor", "sunnysky", "tattu"]
let nameCache: string[] | null = null
const brandNames = () => {
  if (nameCache) return nameCache
  const fromKg = all<{ name: string }>("SELECT name FROM manufacturers").map((r) => r.name.toLowerCase().replace(/\(.*?\)/g, " ").trim()).filter((n) => n.length >= 3)
  nameCache = [...new Set([...fromKg, ...EXTRA_NAMES])]
  return nameCache
}

export function validateGeneral(text: string): { ok: boolean; reason: string } {
  const t = text.trim()
  if (t.length < 60) return { ok: false, reason: "너무 짧음" }
  if (t.length > 1600) return { ok: false, reason: "너무 김" }
  if (/[0-9０-９]/.test(t)) return { ok: false, reason: "숫자 포함" }
  if (NUM_WORD.test(t)) return { ok: false, reason: "수치 표현(단어) 포함" }
  if (ASSERT.test(t)) return { ok: false, reason: "단정 표현 포함" }
  // 한글과 외국 문자가 섞인 깨진 단어('바ométric'·'프롭eller')는 폐기한다(실측: 모델 출력에서 발견).
  if (/[\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]/.test(t)) return { ok: false, reason: "비한글·비영어 문자 포함(깨진 출력)" }
  if (/[가-힣][a-z]{3,}/.test(t)) return { ok: false, reason: "한글 뒤에 영어 단어가 붙음(깨진 출력)" }
  const low = t.toLowerCase()
  const hit = brandNames().find((n) => new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(low))
  if (hit) return { ok: false, reason: `제품·제조사·소프트웨어 이름 포함(${hit})` }
  // 한국어 문장 안의 영어 단어(mismatch·Canyon·overshoot)는 번역 누락·혼용 신호다. 대문자 약어(ESC·GPS·IMU·EKF…)만 허용한다.
  const eng = t.match(/[A-Za-z]{4,}/g)?.find((w) => w !== w.toUpperCase())
  if (eng) return { ok: false, reason: `영어 단어 혼용(${eng})` }
  const bullets = t.split("\n").filter((l) => /^\s*[-*•]\s/.test(l)).length
  if (bullets > 6) return { ok: false, reason: "항목 과다" }
  if (/점검 ?순서|정의·원리|\*\*정의/.test(t)) return { ok: false, reason: "허용 범위 밖 소제목(원인 후보만)" }
  if (bullets < 2) return { ok: false, reason: "항목 형식 아님" }
  return { ok: true, reason: "통과" }
}

export const GENERAL_HEADER = "🔮 **일반 공학 설명** — 위키·지식그래프 근거 아님 · 재확인 필요"
export const GENERAL_FOOTER = "일반적으로 알려진 원리를 정리한 것이며 이 사이트의 검증된 근거가 아닙니다. 기체·부품·상황에 따라 다를 수 있으니 제조사 문서와 점검으로 확인하세요."

const SYSTEM = `당신은 드론 공학 설명 보조입니다. 증상·에러의 **일반적인 원인 후보**만 짧고 조심스럽게 나열합니다. 이 설명은 검증된 근거가 아니므로 확신이 없으면 항목을 줄입니다.

반드시 지킬 것
1. 출력은 소제목 '**원인 후보**' 하나와 '-' 불릿 두 개에서 다섯 개뿐입니다. 항목당 한 문장입니다. 정의·원리 설명, 점검 순서, 해결 방법은 쓰지 않습니다.
2. 숫자·단위·수치·임계값을 쓰지 않습니다. 목록 번호도 쓰지 않습니다. "수십", "몇 배" 같은 수치 표현도 금지합니다.
3. 제품명·제조사명·소프트웨어 이름·메뉴 이름을 쓰지 않습니다(일반 용어만: 모터, 변속기, 비행 컨트롤러, 배터리, 수신기 등).
4. 단정하지 않습니다: "~일 수 있습니다", "~인 경우가 많습니다"처럼 가능성으로 씁니다. "반드시/항상/절대/보장" 금지.
5. 안전 판단(비행해도 되는지), 법규, 부품 추천, 설정 변경·분해·캘리브레이션 같은 실작업 안내는 하지 않습니다.
6. 한국어로만 씁니다. 영어 단어를 섞지 않고, ESC·GPS·IMU 같은 대문자 약어만 허용합니다. 한글 단어에 영어 철자를 섞지 않습니다.`

const KIND_HINT: Record<Kind, string> = {
  cause: "질문은 증상·에러의 원인을 묻습니다. 일반적인 원인 범주를 나열하세요.",
}

export type Generate = (system: string, prompt: string) => Promise<string>
// 정확도가 지연보다 중요하므로 큰 모델 우선 체인(builder)을 쓴다. 이 호출은 본문과 분리되어 있어 본문 응답 시간에 영향이 없다.
const defaultGenerate: Generate = async (system, prompt) => await streamText({ model: wikiModel("builder"), system, prompt, temperature: 0 }).text

// 엔드포인트와 평가 스크립트가 쓰는 진입점. 자격 판정 → 생성 → 검증. 어느 단계든 실패하면 블록을 내지 않는다(본문은 영향 없음).
export async function generalTier(question: string, opts: { generate?: Generate; plan?: Plan } = {}): Promise<GeneralTierResult> {
  const t0 = Date.now()
  const plan = opts.plan ?? planQuery(question)
  const el = eligibility(question, plan)
  if (!el.eligible || !el.kind) return { status: "skipped", reason: el.reason }
  let raw = ""
  try {
    raw = await (opts.generate ?? defaultGenerate)(SYSTEM, `${KIND_HINT[el.kind]}\n\n질문: ${question}`)
  } catch {
    return { status: "skipped", reason: "모델 호출 실패", kind: el.kind, ms: Date.now() - t0 }
  }
  // 목록 번호(1. 2.)는 수치가 아니라 형식이다 — 불릿으로 바꾼 뒤 검증한다(실측: 숫자 폐기 10건 중 7건이 목록 번호). 그 밖의 숫자는 그대로 폐기 대상이다.
  const body = raw.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").replace(/^(\s*)\d+[.)]\s+/gm, "$1- ").trim()
  const v = validateGeneral(body)
  if (!v.ok) return { status: "rejected", reason: v.reason, kind: el.kind, ms: Date.now() - t0 }
  return { status: "shown", reason: "통과", kind: el.kind, text: `${GENERAL_HEADER}\n\n${body}\n\n<sub>${GENERAL_FOOTER}</sub>`, ms: Date.now() - t0 }
}
