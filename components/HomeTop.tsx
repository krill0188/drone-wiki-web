"use client"
import HeroSection from "@/components/HeroSection"
import AnimatedFeatureCard from "@/components/AnimatedFeatureCard"
import WorkshopHome from "@/components/WorkshopHome"
import { useSkin } from "@/lib/skin"

// 홈 윗부분: 작업실 스킨(기본) 또는 기본 스킨(기존 히어로+기능 카드 3종). 사이드바에서 바꾼다.
export default function HomeTop({ docs, rules }: { docs: number; rules: number }) {
  const [skin] = useSkin()
  if (skin === "workshop") return <WorkshopHome docs={docs} rules={rules} />
  return (
    <>
      <HeroSection />
      <div className="max-w-3xl mx-auto px-4">
        <div className="grid sm:grid-cols-3 gap-3 mb-10">
          <AnimatedFeatureCard href="/chat" emoji="💬" eyebrow="드론 지식이 궁금할 때" title="AI Q&A" desc="위키 문서와 지식그래프(GraphRAG)를 근거로 실시간 스트리밍 답변" delay={0} />
          <AnimatedFeatureCard href="/wiki-editor" emoji="✍️" eyebrow="정리 안 된 메모가 있을 때" title="AI 에디터" desc="초안을 넣으면 프론트매터·개요·스펙까지 갖춘 문서로 구조화" delay={0.1} />
          <AnimatedFeatureCard href="/ai-drone-builder" emoji="🚀" eyebrow="새 드론 프로젝트를 시작할 때" title="AI 드론 빌더" desc="기획 → HW·SW 스펙 → 기술 스펙 → 아키텍처 → 코드·로드맵, 6단계 에이전트가 순차로 작성" delay={0.2} />
        </div>
      </div>
    </>
  )
}
