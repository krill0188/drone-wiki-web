import eventsFile from "../data/ontology/events.json"
import lawsFile from "../data/ontology/laws.json"

// 동향 이벤트(뉴스·릴리스·영상·법령 개정) 조회. 설계: docs/dikw-dynamic-ontology-design.md §5.
// 이 모듈의 결과는 UI 패널(answerMeta 바깥 메타데이터)로만 나간다. plan·NimContext·시스템 프롬프트에는 절대 넣지 않는다 —
// 이벤트는 검증되지 않은 제3자 콘텐츠라 답변의 사실 근거가 아니다(10/19 "지식그래프 전용 답변" 원칙).
// KG_EVENTS=1 일 때만 쓴다(기본 off). 법령 개정 알림은 별도 플래그 KG_LAW_EVENTS=1 이고, laws.json 이 마스터 확정(confirmed=true)이어야 한다.

export const eventsEnabled = () => process.env.KG_EVENTS === "1"
export const lawEventsEnabled = () => process.env.KG_LAW_EVENTS === "1"

// kind="law" 는 런타임에서만 붙는 표시용 값이다(events.json 에는 없다).
export interface RelatedEvent { id: string; title: string; url: string; source: string; eventType: string; published: string; about: string; kind?: "law" }

interface EventRow { id: string; title: string; url: string; source: string; eventType: string; published: string }
interface LinkRow { event: string; node: string; nodeType: string }
const F = eventsFile as unknown as { window_days: number; law_window_days?: number; events: EventRow[]; links: LinkRow[] }

const byId = new Map(F.events.map((e) => [e.id, e]))
const linksByNode = new Map<string, LinkRow[]>()
for (const l of F.links) (linksByNode.get(l.node) ?? linksByNode.set(l.node, []).get(l.node)!).push(l)

const DAY_MS = 86_400_000

// 답변에 연결된 개체(제품은 자기 자신 + 제조사)에 링크된 이벤트를 최신순으로 최대 max건. 배포된 정적 파일이 낡아도 질의 시점 기준 90일 창을 다시 적용한다.
export function relatedEventsFor(entities: { id: string; label: string; attributes: Record<string, unknown> }[], max = 3, now: Date = new Date()): RelatedEvent[] {
  const floor = now.getTime() - F.window_days * DAY_MS
  const seen = new Set<string>()
  const out: RelatedEvent[] = []
  for (const e of entities) {
    const nodes = [e.id, ...(typeof e.attributes.manufacturer_id === "string" ? [e.attributes.manufacturer_id] : [])]
    for (const nid of nodes) {
      for (const l of linksByNode.get(nid) ?? []) {
        const ev = byId.get(l.event)
        if (!ev || seen.has(ev.id) || Date.parse(ev.published) < floor) continue
        seen.add(ev.id)
        out.push({ id: ev.id, title: ev.title, url: ev.url, source: ev.source, eventType: ev.eventType, published: ev.published, about: l.nodeType === "Manufacturer" && nid !== e.id ? "제조사" : e.label })
      }
    }
  }
  // 영상(공식 채널 홍보물 등)은 설계 판단에 노이즈가 많아 뉴스·릴리스보다 뒤에 둔다. 같은 묶음 안에서는 최신순.
  const rank = (e: RelatedEvent) => (e.eventType === "video" ? 1 : 0)
  return out.sort((a, b) => rank(a) - rank(b) || b.published.localeCompare(a.published) || a.id.localeCompare(b.id)).slice(0, max)
}

export interface LawRow { id: string; name: string; aliases: string[]; topics: string[] }
export interface LawsFile { confirmed?: boolean; topics: Record<string, string[]>; laws: LawRow[] }
export interface EventsFile { law_window_days?: number; events: EventRow[]; links: LinkRow[] }

// 공백을 없애 '초경량 비행장치'와 '초경량비행장치'를 같게 본다.
export const compact = (s: string) => s.toLowerCase().replace(/\s+/g, "")
// 질문에서 찾을 말 = 법령명 + 별칭 + 주제어. 3자 미만은 오탐이 많아 쓰지 않는다. 목록은 사람이 정한 laws.json 만 쓴다(자동 생성·확장 없음).
export const termsOf = (law: LawRow, topics: Record<string, string[]>) =>
  [...new Set([law.name, ...law.aliases, ...law.topics.flatMap((t) => topics[t] ?? [])].map(compact).filter((x) => x.length >= 3))]

export interface LawSource { confirmed: boolean; windowDays: number; laws: { law: LawRow; terms: string[] }[]; byId: Map<string, EventRow>; linksByNode: Map<string, LinkRow[]> }

export function makeLawSource(laws: LawsFile, ev: EventsFile): LawSource {
  const links = new Map<string, LinkRow[]>()
  for (const l of ev.links) (links.get(l.node) ?? links.set(l.node, []).get(l.node)!).push(l)
  return {
    confirmed: laws.confirmed === true,
    windowDays: ev.law_window_days ?? 365,
    laws: laws.laws.map((law) => ({ law, terms: termsOf(law, laws.topics) })),
    byId: new Map(ev.events.map((e) => [e.id, e])),
    linksByNode: links,
  }
}

// 질문이 확정된 법령(이름·별칭·주제어)을 언급하면, 그 법령의 개정·시행 알림을 최신순 최대 max건. 사실 근거가 아니라 UI 패널 전용이다.
// 개정은 공포 후 시행까지 오래 걸려도 의미가 있으므로 창은 law_window_days(기본 365일)를 질의 시점 기준으로 다시 적용한다.
export function lawEventsFrom(src: LawSource, question: string, max = 3, now: Date = new Date()): RelatedEvent[] {
  if (!src.confirmed) return []
  const q = compact(question)
  const floor = now.getTime() - src.windowDays * DAY_MS
  const seen = new Set<string>()
  const out: RelatedEvent[] = []
  for (const { law, terms } of src.laws) {
    if (!terms.some((x) => q.includes(x))) continue
    for (const l of src.linksByNode.get(law.id) ?? []) {
      const ev = src.byId.get(l.event)
      if (l.nodeType !== "Law" || !ev || seen.has(ev.id) || Date.parse(ev.published) < floor) continue
      seen.add(ev.id)
      out.push({ id: ev.id, title: ev.title, url: ev.url, source: ev.source, eventType: ev.eventType, published: ev.published, about: law.name, kind: "law" })
    }
  }
  return out.sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id)).slice(0, max)
}

const LAW_SRC = makeLawSource(lawsFile as unknown as LawsFile, F as EventsFile)
export const relatedLawEventsFor = (question: string, max = 3, now: Date = new Date()) => lawEventsFrom(LAW_SRC, question, max, now)
