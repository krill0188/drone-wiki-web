"use client"
import { MotionConfig } from "framer-motion"

// 사용자가 OS에서 '동작 줄이기'를 켰으면 하위 모든 framer-motion 애니메이션의 이동·크기 변화를 끈다(접근성).
export default function ReducedMotion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
