// 5개 메뉴(2026-10-24 승인): 질문하기 · 설계 도우미 · 자료 탐색(위키·지식그래프·뉴스·에디터) · 근거 센터 · 소개.
// 기존 주소(URL)는 하나도 바꾸지 않고 사이드바 묶음만 바꾼다.
export type NavLeaf = { href: string; icon: string; label: string; hint?: string }
export type NavGroup = { key: string; icon: string; label: string; href?: string; hint?: string; children?: NavLeaf[] }
export const NAV: NavGroup[] = [
  { key: "ask", href: "/chat", icon: "💬", label: "질문하기", hint: "AI Q&A" },
  { key: "design", href: "/ai-drone-builder", icon: "🚀", label: "설계 도우미", hint: "AI 드론 빌더" },
  {
    key: "explore", icon: "📖", label: "자료 탐색",
    children: [
      { href: "/wiki", icon: "📖", label: "위키" },
      { href: "/knowledge", icon: "🕸", label: "지식그래프" },
      { href: "/news", icon: "📰", label: "뉴스" },
      { href: "/wiki-editor", icon: "✍️", label: "AI 에디터" },
    ],
  },
  {
    key: "evidence", icon: "🧾", label: "근거 센터",
    children: [
      { href: "/knowledge-quality", icon: "📊", label: "지식 품질" },
      { href: "/discovery-review", icon: "🔎", label: "추측 지도 검토" },
    ],
  },
  { key: "about", href: "/about", icon: "🧭", label: "소개", hint: "한눈에 보기·운영 상태" },
]
export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/")

