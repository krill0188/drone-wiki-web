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

export default function StatsSection() {
  return (
    <div className="grid grid-cols-3 gap-3 my-10">
      <StatCard value={23} label="물리 법칙 규칙" suffix="개" delay={0} />
      <StatCard value={6} label="AI 에이전트 단계" suffix="단계" delay={0.1} />
      <StatCard value={100} label="사람 검증 기반" suffix="%" delay={0.2} />
    </div>
  )
}
