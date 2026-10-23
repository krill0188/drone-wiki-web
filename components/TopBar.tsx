"use client"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { NAV, isActive } from "@/lib/nav"

// 모든 화면 위쪽의 "← 뒤로" 줄(홈 제외). 메뉴를 눌러 들어간 뒤 돌아갈 방법이 없던 불편을 없앤다.
// 이전 화면이 있으면 뒤로 가고, 없으면(새 탭·바로 열기) 홈으로 간다. 휴대폰에서는 왼쪽 위 ☰ 버튼 오른쪽에 놓인다.
export default function TopBar() {
  const router = useRouter()
  const pathname = usePathname()
  if (pathname === "/") return <div className="h-12 lg:hidden" aria-hidden /> // 홈은 ☰ 버튼 자리만 비워 둔다
  const where = NAV.flatMap((g) => (g.href ? [{ href: g.href, label: g.label }] : g.children ?? [])).find((i) => isActive(pathname, i.href))?.label
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/")
  }
  return (
    <div className="sticky top-0 z-30 h-12 flex items-center gap-2 pl-14 pr-4 lg:pl-4 bg-paper/90 backdrop-blur border-b border-line">
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line bg-panel text-[14px] font-medium hover:border-signal-500 hover:text-signal-600 transition-colors"
      >
        <span aria-hidden>←</span> 뒤로
      </button>
      <Link href="/" className="h-9 inline-flex items-center px-3 rounded-md text-[13px] text-ink-dim hover:text-ink">홈</Link>
      {where && <span className="ml-auto text-[12px] font-hud text-ink-dim truncate">{where}</span>}
    </div>
  )
}
