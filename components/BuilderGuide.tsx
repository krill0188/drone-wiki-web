"use client"

// 1단계 시작 전 안내: 필수 4조건 작성법 + 예제 드론 3가지. 카드를 누르면 입력칸에 예제가 채워진다.
// 색은 은은한 그라데이션 배경뿐이고 움직임은 없다(누를 때만 테두리 강조).
const CONDITIONS = [
  { name: "페이로드", how: "싣는 무게를 kg 또는 g로", ex: "2kg / 500g / 없음", from: "#ffe3cf", to: "#ffd0c4" },
  { name: "비행가능거리", how: "총 거리 또는 반경을 km로", ex: "총 10km / 반경 5km", from: "#d9ecff", to: "#cfe0ff" },
  { name: "크기", how: "휠베이스(모터 간 대각선) mm", ex: "휠베이스 600mm", from: "#d8f3e4", to: "#c8ecef" },
  { name: "비행시간", how: "한 번 뜨는 시간을 분으로", ex: "30분 / 1시간", from: "#ece0ff", to: "#e0d4fa" },
]

export const GUIDE_EXAMPLES = [
  { title: "산불 감시용 자율비행 드론", spec: { payload: "0.5kg(열화상 카메라)", range: "총 30km", size: "휠베이스 800mm", time: "45분" }, from: "#ffe3cf", to: "#ffc9b3" },
  { title: "GPS 없는 실내 물류창고 배송 드론", spec: { payload: "1kg", range: "총 2km", size: "휠베이스 450mm", time: "20분" }, from: "#d9ecff", to: "#bcd3ff" },
  { title: "군집비행 정찰 드론 시스템", spec: { payload: "300g", range: "반경 5km", size: "휠베이스 250mm", time: "25분" }, from: "#d8f3e4", to: "#bfe6ee" },
]

export function exampleText(e: (typeof GUIDE_EXAMPLES)[number]) {
  const s = e.spec
  return `${e.title} — 페이로드 ${s.payload}, 비행가능거리 ${s.range}, 크기 ${s.size}, 비행시간 ${s.time}`
}

export default function BuilderGuide({ onPick }: { onPick: (text: string) => void }) {
  return (
    <section className="mb-6" aria-label="입력 방법 안내">
      <p className="text-xs text-slate-500 mb-2">
        <strong>이 4가지</strong>를 함께 적어 주세요. 하나라도 빠지면 먼저 되물어요(없는 값을 지어내지 않기 위해서예요).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {CONDITIONS.map((c, i) => (
          <div key={c.name} className="rounded-xl p-3 text-slate-800" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
            <p className="text-[11px] opacity-70">{i + 1}</p>
            <p className="font-semibold text-sm">{c.name}</p>
            <p className="text-[12px] mt-0.5 break-keep">{c.how}</p>
            <p className="text-[11px] mt-1 opacity-75 break-keep">예) {c.ex}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mb-2">예제 드론을 누르면 입력칸에 채워져요. 숫자만 바꿔서 쓰세요.</p>
      <div className="grid sm:grid-cols-3 gap-2">
        {GUIDE_EXAMPLES.map((e) => (
          <button
            key={e.title}
            type="button"
            onClick={() => onPick(exampleText(e))}
            className="text-left rounded-xl p-3 text-slate-800 border-2 border-transparent hover:border-slate-700 focus-visible:border-slate-700 outline-none transition-colors"
            style={{ background: `linear-gradient(135deg, ${e.from}, ${e.to})` }}
          >
            <p className="font-semibold text-sm break-keep">{e.title}</p>
            <ul className="mt-1.5 text-[12px] leading-relaxed list-none p-0 m-0">
              <li>페이로드 · {e.spec.payload}</li>
              <li>거리 · {e.spec.range}</li>
              <li>크기 · {e.spec.size}</li>
              <li>시간 · {e.spec.time}</li>
            </ul>
          </button>
        ))}
      </div>
    </section>
  )
}
