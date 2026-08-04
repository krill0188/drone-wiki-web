import { NextRequest, NextResponse } from "next/server"
import { getPageBySlug } from "@/lib/wiki"

// 지식 그래프 뷰(app/graph)의 노드 클릭 시 인라인 미리보기 패널용 — openwiki의
// "그래프 옆 라이브 마크다운 리더" 패턴을 반영. 기존 app/api/pages(목록)와는
// 별개 라우트라 기존 응답 형식을 건드리지 않는다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await getPageBySlug(slug)
  if (!page) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({
    slug: page.slug,
    title: page.title,
    domain: page.domain,
    layer: page.layer,
    tags: page.tags,
    contentHtml: page.contentHtml,
    updated: page.updated,
    confidence: page.confidence,
  })
}
