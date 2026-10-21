"use client"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"

const steps = [
  {
    icon: "📡",
    label: "수집",
    sub: "Capture",
    desc: "매일 새벽 전 세계 논문·뉴스·유튜브 자동 수집",
    color: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
  },
  {
    icon: "🧠",
    label: "구조화",
    sub: "Ontology",
    desc: "물리 법칙·호환성 23개 규칙으로 지식그래프 연결",
    color: "from-purple-500/20 to-purple-600/10",
    border: "border-purple-500/30",
  },
  {
    icon: "✅",
    label: "검증",
    sub: "Human Gate",
    desc: "사람이 직접 검토·승인한 지식만 위키에 반영",
    color: "from-green-500/20 to-green-600/10",
    border: "border-green-500/30",
  },
  {
    icon: "🌐",
    label: "서비스",
    sub: "Public Wiki",
    desc: "근거 있는 답변만 하는 AI 플랫폼으로 제공",
    color: "from-orange-500/20 to-orange-600/10",
    border: "border-orange-500/30",
  },
]

export default function PipelineFlow() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <div ref={ref} className="my-10">
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="font-bold text-base mb-5 text-center"
      >
        🔄 2nd Brain 파이프라인
      </motion.h2>

      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0">
        {steps.map((step, i) => (
          <div key={step.label} className="flex sm:flex-row flex-col items-center w-full sm:w-auto sm:flex-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.45, delay: i * 0.15 }}
              className={`relative flex flex-col items-center text-center p-4 rounded-xl border bg-gradient-to-br ${step.color} ${step.border} w-full sm:w-auto flex-1`}
            >
              <motion.span
                className="text-2xl mb-1.5"
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
              >
                {step.icon}
              </motion.span>
              <span className="font-bold text-[15px]">{step.label}</span>
              <span className="text-[11px] text-ink-dim font-hud mb-1">{step.sub}</span>
              <span className="text-[11px] text-ink-dim leading-relaxed">{step.desc}</span>
            </motion.div>

            {/* 화살표 */}
            {i < steps.length - 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ delay: i * 0.15 + 0.3 }}
                className="text-ink-dim text-lg sm:mx-1 my-1 sm:my-0 rotate-90 sm:rotate-0"
              >
                →
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
