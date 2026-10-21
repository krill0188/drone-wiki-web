"use client"
import Link from "next/link"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"

export default function AnimatedFeatureCard({
  href, emoji, eyebrow, title, desc, delay = 0,
}: {
  href: string; emoji: string; eyebrow: string; title: string; desc: string; delay?: number
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
    >
      <Link
        href={href}
        className="group relative flex flex-col gap-3 p-6 rounded-2xl border border-line bg-panel hover:border-signal-500 transition-colors overflow-hidden min-h-[230px]"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-3 -bottom-5 text-[130px] leading-none opacity-[0.06] group-hover:opacity-[0.11] transition-opacity select-none"
        >
          {emoji}
        </span>
        <span className="relative text-[13px] text-ink-dim">{eyebrow}</span>
        <span className="relative font-display font-bold text-2xl leading-tight">{title}</span>
        <span className="relative text-[13px] text-ink-dim leading-relaxed flex-1">{desc}</span>
        <span className="relative inline-flex items-center gap-1 self-start px-4 py-1.5 rounded-full border border-line text-[13px] font-medium group-hover:border-signal-500 group-hover:text-signal-600 group-hover:bg-signal-500/10 transition-colors">
          시작하기 →
        </span>
      </Link>
    </motion.div>
  )
}
