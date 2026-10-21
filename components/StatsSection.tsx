"use client"
import { motion, useInView } from "framer-motion"
import { useRef, useEffect, useState } from "react"

function useCountUp(target: number, inView: boolean, duration = 1.5) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!inView) return
    let start = 0
    const step = target / (duration * 60)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 1000 / 60)
    return () => clearInterval(timer)
  }, [inView, target, duration])
  return count
}

function StatCard({ value, label, suffix = "", delay = 0 }: {
  value: number; label: string; suffix?: string; delay?: number
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const count = useCountUp(value, inView)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="flex flex-col items-center text-center p-4 rounded-xl border border-line bg-panel"
    >
      <span className="font-display font-bold text-3xl text-signal-600">
        {count.toLocaleString()}{suffix}
      </span>
      <span className="text-[12px] text-ink-dim mt-1">{label}</span>
    </motion.div>
  )
}

// 숫자는 서버(app/page.tsx)가 data/ontology 에서 읽어 넘긴다. 하드코딩한 23개·100%는 실제와 달랐다(2026-10-21).
export default function StatsSection({ rules, docs }: { rules: number; docs: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 my-10">
      <StatCard value={rules} label="코드로 구현된 공학 규칙" suffix="개" delay={0} />
      <StatCard value={6} label="AI 에이전트 단계" suffix="단계" delay={0.1} />
      <StatCard value={docs} label="공개 위키 문서" suffix="편" delay={0.2} />
    </div>
  )
}
