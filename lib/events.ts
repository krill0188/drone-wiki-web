import eventsFile from "../data/ontology/events.json"

// 동향 이벤트(뉴스·릴리스·영상) 조회. 설계: docs/dikw-dynamic-ontology-design.md §5.
// 이 모듈의 결과는 UI 패널(answerMeta 바깥 메타데이터)로만 나간다. plan·NimContext·시스템 프롬프트에는 절대 넣지 않는다 —
// 이벤트는 검증되지 않은 제3자 콘텐츠라 답변의 사실 근거가 아니다(10/19 "지식그래프 전용 답변" 원칙).
// KG_EVENTS=1 일 때만 쓴다(기본 off).

export const eventsEnabled = () => process.env.KG_EVENTS === "1"

export interface RelatedEvent { id: string; title: string; url: string; source: string; eventType: string; published: string; about: string }

interface EventRow { id: string; title: string; url: string; source: string; eventType: string; published: string }
interface LinkRow { event: string; node: string; nodeType: string }
const F = eventsFile as unknown as { window_days: number; events: EventRow[]; links: LinkRow[] }

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
