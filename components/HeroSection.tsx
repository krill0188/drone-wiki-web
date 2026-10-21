"use client"
import { motion } from "framer-motion"
import DroneIcon from "@/components/DroneIcon"

export default function HeroSection() {
  return (
    <div className="text-center pt-14 pb-10 px-4 border-b border-line mb-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 200 }}
        className="mx-auto mb-3 w-fit"
      >
        <DroneIcon className="w-12 h-12 text-ink" animate />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-2"
      >
        DroneWiki
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="text-ink-dim text-sm sm:text-[15px] mb-7"
      >
        드론 비행제어·통신·하드웨어·GCS·법규·AI 자율 — 모든 드론 지식을 AI와 함께
      </motion.p>

      <div className="flex flex-col gap-2.5 max-w-sm mx-auto text-left text-[13px]">
        {[
          { n: "01", prefix: "왼쪽 사이드바의 ", bold: "AI Q&A", rest: "로 바로 질문하세요" },
          { n: "02", prefix: "", bold: "위키", rest: " 문서를 읽다가 텍스트를 선택하면 그 자리에서 질문·저장" },
          { n: "03", prefix: "", bold: "AI 드론 빌더", rest: "에 컨셉 한 줄로 프로젝트 전체를 설계" },
        ].map((item, i) => (
          <motion.div
            key={item.n}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 + i * 0.12 }}
            className="flex items-start gap-2.5"
          >
            <span className="font-hud text-signal-600 shrink-0 mt-px">{item.n}</span>
            <span className="text-ink-dim">
              {item.prefix}<strong className="text-ink">{item.bold}</strong>{item.rest}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
