// 관련 최신 동향 패널. 검증되지 않은 제3자 콘텐츠이므로 답변 근거가 아님을 항상 표시하고, 기본은 접어 둔다.
// 모델은 이 내용을 보지 못한다(lib/events.ts 설명 참고). 서버 컴포넌트로도 렌더 가능한 순수 표현 컴포넌트다.
export interface RelatedEventView { id: string; title: string; url: string; source: string; eventType: string; published: string; about: string; kind?: "law" }

export default function RelatedEvents({ events }: { events?: RelatedEventView[] }) {
  if (!events || events.length === 0) return null
  return (
    <details className="px-1">
      <summary className="text-[11px] font-hud text-ink-dim mb-1 cursor-pointer select-none hover:text-signal-600">
        🗞 관련 최신 동향 ({events.length}) · 미검증, 답변 근거 아님
      </summary>
      <div className="flex flex-col gap-1 mt-1 text-[11px] text-ink-dim">
        {events.map((ev) => (
          <p key={ev.id}>
            · <span className="text-[10px]">{ev.published} · {ev.kind === "law" ? "⚖ 법령 · " : ""}{ev.about}</span>{" "}
            <a href={ev.url} target="_blank" rel="noopener noreferrer" className="underline">{ev.kind === "law" ? ev.title.replace(/^\[법령\]\s*/, "") : ev.title}</a>{" "}
            <span className="text-[10px]">({ev.source})</span>
          </p>
        ))}
        {events.some((ev) => ev.kind === "law") && (
          <p className="text-[10px]">⚖ 법령 항목은 개정·시행 알림일 뿐 법적 자문이 아닙니다. 적용 여부는 법제처 원문에서 확인하세요.</p>
        )}
      </div>
    </details>
  )
}
