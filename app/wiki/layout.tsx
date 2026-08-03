import WikiTreeNav from "@/components/WikiTreeNav"

// UnivAI 스타일 3단 구성의 좌측 트리뷰 + 중앙 워크스페이스. 우측 AI 컴패니언은
// 전역에 이미 떠 있는 components/Chat.tsx(고정 사이드바)가 맡는다.
export default function WikiSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <WikiTreeNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
