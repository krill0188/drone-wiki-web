"use client"
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

// 답변·단계 생성 중 화면이 비어 보이지 않도록 하는 대기 표시.
// 경과 시간에 따라 안내 문구가 단계적으로 바뀐다(길어져도 멈춘 게 아님을 알림).
// 모션 감소 설정은 상위 ReducedMotion(MotionConfig)이 이동·크기 변화를 꺼준다.

const STEPS: { from: number; text: string }[] = [
  { from: 0, text: "지식그래프에서 근거를 찾는 중입니다" },
  { from: 6, text: "근거를 대조하며 답변을 작성하고 있습니다" },
  { from: 18, text: "답변이 길어지고 있어요. 작성 중이니 조금만 기다려 주세요" },
  { from: 45, text: "복잡한 질문은 1분 가까이 걸릴 수 있습니다. 계속 작성 중입니다" },
  { from: 90, text: "거의 다 왔습니다. 마무리 검증을 하고 있어요" },
]

export function stepText(sec: number, detail?: string) {
  let t = STEPS[0].text
  for (const s of STEPS) if (sec >= s.from) t = s.text
  return detail ? `${detail} · ${t}` : t
}

function Rotor() {
  return (
    <div className="relative w-7 h-7 shrink-0" aria-hidden>
      <motion.svg viewBox="0 0 32 32" className="absolute inset-0" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}>
        <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-signal-500">
          <line x1="16" y1="4" x2="16" y2="12" />
          <line x1="16" y1="20" x2="16" y2="28" />
          <line x1="4" y1="16" x2="12" y2="16" opacity="0.55" />
          <line x1="20" y1="16" x2="28" y2="16" opacity="0.55" />
        </g>
      </motion.svg>
      <motion.span className="absolute left-1/2 top-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-signal-500" animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />
    </div>
  )
}

export default function WaitingIndicator({ active = true, detail, compact = false }: { active?: boolean; detail?: string; compact?: boolean }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!active) { setSec(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [active])
  if (!active) return null
  const msg = stepText(sec, detail)
  return (
    <div role="status" aria-live="polite" className={compact ? "flex flex-col gap-1.5" : "flex flex-col gap-2"}>
      <div className="flex items-center gap-2.5">
        <Rotor />
        <AnimatePresence mode="wait">
          <motion.span key={msg} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="font-hud text-[11px] text-ink-dim">
            {msg}
            <span className="inline-flex ml-1">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}>.</motion.span>
              ))}
            </span>
          </motion.span>
        </AnimatePresence>
        <span className="ml-auto font-hud text-[10px] text-ink-dim tabular-nums">{sec}초</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-line/60">
        <motion.div className="h-full w-1/3 rounded-full bg-signal-500/70" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }} />
      </div>
    </div>
  )
}

// 글자가 흘러나오는 동안 말풍선 끝에 붙이는 작성 중 표시
export function TypingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle" aria-label="작성 중">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="w-1 h-1 rounded-full bg-signal-500" animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }} />
      ))}
    </span>
  )
}
