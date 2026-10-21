"use client"
// Liner 벤치마킹: 이모지 대신 브랜드 마크로 쓸 수 있는 모노라인 드론(쿼드콥터)
// 아이콘. currentColor를 써서 놓이는 곳의 텍스트 색을 그대로 물려받는다.
import { motion } from "framer-motion"

const propellerVariants = [0, 0.1, 0.2, 0.3]
const positions = [
  { cx: 6, cy: 6 },
  { cx: 26, cy: 6 },
  { cx: 6, cy: 26 },
  { cx: 26, cy: 26 },
]

function DroneSvg({ className, animated }: { className: string; animated: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      {positions.map((pos, i) =>
        animated ? (
          <motion.circle
            key={i}
            cx={pos.cx}
            cy={pos.cy}
            r="3.4"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 0.4, repeat: Infinity, delay: propellerVariants[i] }}
          />
        ) : (
          <circle key={i} cx={pos.cx} cy={pos.cy} r="3.4" />
        )
      )}
      <line x1="16" y1="16" x2="6" y2="6" />
      <line x1="16" y1="16" x2="26" y2="6" />
      <line x1="16" y1="16" x2="6" y2="26" />
      <line x1="16" y1="16" x2="26" y2="26" />
      <rect x="12.5" y="12.5" width="7" height="7" rx="2" />
    </svg>
  )
}

export default function DroneIcon({ className = "w-6 h-6", animate = false }: { className?: string; animate?: boolean }) {
  if (!animate) {
    return <DroneSvg className={className} animated={false} />
  }

  return (
    <motion.div
      className="inline-flex"
      animate={{ y: [0, -6, 0], rotate: [0, 2, -2, 0] }}
      transition={{ duration: 3.5, repeat: Infinity }}
    >
      <DroneSvg className={className} animated />
    </motion.div>
  )
}
