// Liner 벤치마킹: 이모지 대신 브랜드 마크로 쓸 수 있는 모노라인 드론(쿼드콥터)
// 아이콘. currentColor를 써서 놓이는 곳의 텍스트 색을 그대로 물려받는다.
export default function DroneIcon({ className = "w-6 h-6" }: { className?: string }) {
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
      <line x1="16" y1="16" x2="6" y2="6" />
      <line x1="16" y1="16" x2="26" y2="6" />
      <line x1="16" y1="16" x2="6" y2="26" />
      <line x1="16" y1="16" x2="26" y2="26" />
      <circle cx="6" cy="6" r="3.4" />
      <circle cx="26" cy="6" r="3.4" />
      <circle cx="6" cy="26" r="3.4" />
      <circle cx="26" cy="26" r="3.4" />
      <rect x="12.5" y="12.5" width="7" height="7" rx="2" />
    </svg>
  )
}
