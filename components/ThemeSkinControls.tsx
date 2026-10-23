"use client"
import { useSkin, useTheme, type Theme } from "@/lib/skin"

// 사이드바 아래: 낮/밤/자동과 작업실 스킨 켬·끔. 눌린 항목은 aria-pressed로 알린다.
const OPTS: { v: Theme; label: string }[] = [
  { v: "light", label: "낮" },
  { v: "dark", label: "밤" },
  { v: "system", label: "자동" },
]
export default function ThemeSkinControls() {
  const [theme, setTheme] = useTheme()
  const [skin, setSkin] = useSkin()
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="flex items-center gap-1" role="group" aria-label="화면 밝기">
        <span className="text-ink-dim w-10 shrink-0">화면</span>
        {OPTS.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={theme === o.v}
            onClick={() => setTheme(o.v)}
            className={`flex-1 px-2 py-1 rounded border transition-colors ${theme === o.v ? "bg-ink text-paper border-ink" : "border-line text-ink-dim hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="홈 스킨">
        <span className="text-ink-dim w-10 shrink-0">스킨</span>
        <button type="button" aria-pressed={skin === "workshop"} onClick={() => setSkin("workshop")} className={`flex-1 px-2 py-1 rounded border transition-colors ${skin === "workshop" ? "bg-ink text-paper border-ink" : "border-line text-ink-dim hover:text-ink"}`}>작업실</button>
        <button type="button" aria-pressed={skin === "classic"} onClick={() => setSkin("classic")} className={`flex-1 px-2 py-1 rounded border transition-colors ${skin === "classic" ? "bg-ink text-paper border-ink" : "border-line text-ink-dim hover:text-ink"}`}>기본</button>
      </div>
    </div>
  )
}
