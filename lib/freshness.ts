// 값의 신선도(시점 인식). 저장하는 것은 기준일(as_of)뿐이고 fresh/aging/stale 판정은 질의 시점에 계산한다.
// 배포된 정적 데이터는 시간이 지나면 스스로 낡아 보여야 하므로 판정값을 DB·그래프에 저장하지 않는다.
// 설계: docs/dikw-dynamic-ontology-design.md §4. KG_FRESHNESS=1 일 때만 질의 계획·표·프롬프트에 반영한다(기본 off = 기존 동작).

export type Freshness = "fresh" | "aging" | "stale" | "unknown"
// static: 물리 규칙·논문 claim(낡지 않음) / spec: 제품 사양 / volatile: 가격·재고·최신 펌웨어(해당 필드가 생길 때)
export type Volatility = "static" | "spec" | "volatile"

// 초기 제안값(설계서 D2). 운영 데이터를 보고 조정한다 — 임계값은 이 상수 한 곳에서만 정의한다.
export const FRESH_LIMIT_DAYS: Record<Exclude<Volatility, "static">, { fresh: number; aging: number }> = {
  spec: { fresh: 90, aging: 180 },
  volatile: { fresh: 7, aging: 30 },
}

export const freshnessEnabled = () => process.env.KG_FRESHNESS === "1"

const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/

// 'YYYY-MM-DD'(뒤에 시각이 붙어도 날짜만 본다)를 UTC 자정으로 해석한다. 형식이 틀리거나 존재하지 않는 날짜면 null.
function parseDay(s: string | null | undefined): number | null {
  const m = typeof s === "string" ? ISO_DATE.exec(s.trim()) : null
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const d = new Date(t)
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null
}

export interface FreshnessResult { freshness: Freshness; ageDays: number | null }

// 기준일이 없거나 형식이 틀리거나 미래면 unknown(미래 기준일은 관측일일 수 없으므로 거짓 신선도를 만들지 않는다).
// static은 낡지 않으므로 null을 돌려 호출부가 표시 자체를 하지 않게 한다.
export function freshnessOf(asOf: string | null | undefined, volatility: Volatility, now: Date = new Date()): FreshnessResult | null {
  if (volatility === "static") return null
  const day = parseDay(asOf)
  if (day === null) return { freshness: "unknown", ageDays: null }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const age = Math.round((today - day) / DAY_MS)
  if (age < 0) return { freshness: "unknown", ageDays: null }
  const lim = FRESH_LIMIT_DAYS[volatility]
  return { freshness: age <= lim.fresh ? "fresh" : age <= lim.aging ? "aging" : "stale", ageDays: age }
}

// 표에 쓰는 한 줄. 기준일이 낡았거나 없으면 재확인을 권한다(차단하지 않고 표시만 한다).
export function freshnessRowValue(asOf: unknown, freshness: unknown, ageDays: unknown): string {
  if (freshness === "unknown" || typeof asOf !== "string") return "기준일 미상 (재확인 필요)"
  const age = typeof ageDays === "number" ? ` (${ageDays}일 경과)` : ""
  return freshness === "fresh" ? `${asOf}${age}` : `⚠ ${asOf}${age} — 수집 후 시간이 지났습니다. 출처에서 재확인하세요`
}

// 모델에 주는 규칙. 기준일은 서버가 계산해 context에 넣으므로 모델이 새로 만들지 못하게 한다.
export const FRESHNESS_CONSTRAINT =
  "제품 속성의 freshness가 aging·stale·unknown이면 as_of(수집 기준일)와 함께 '수집 시점 기준이며 재확인 필요'라고 밝히고 값을 단정하지 말 것. context에 없는 기준일·경과일을 만들지 말 것"
