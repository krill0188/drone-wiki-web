import { NextRequest, NextResponse } from "next/server"
import { getSelfUpdateProposals, applyProposal, skipNews, isSelfUpdateWritable, getSelfUpdateStats } from "@/lib/self-update"

// GET: 뉴스↔위키 교차 참조 제안 목록(읽기 전용, Vercel에서도 안전).
export async function GET() {
  const proposals = getSelfUpdateProposals(30)
  const stats = getSelfUpdateStats()
  return NextResponse.json({ proposals, writable: isSelfUpdateWritable(), ...stats })
}

// POST: 제안 하나를 실제 위키 문서에 반영(apply) 또는 건너뛰기(skip).
// discovery/promote·reject와 동일한 게이팅 — 로컬 개발 환경에서만 쓰기 허용.
export async function POST(req: NextRequest) {
  if (!isSelfUpdateWritable()) {
    return NextResponse.json(
      { error: "이 기능은 로컬 개발 환경에서만 사용할 수 있습니다(배포된 사이트에서는 위키 문서를 쓸 수 없습니다)." },
      { status: 403 }
    )
  }

  const body = await req.json()

  if (body.action === "skip") {
    if (!body.newsUrl) return NextResponse.json({ error: "newsUrl이 필요합니다." }, { status: 400 })
    skipNews(body.newsUrl)
    return NextResponse.json({ ok: true })
  }

  const proposal = body.proposal
  if (!proposal?.newsUrl || !proposal?.slug) {
    return NextResponse.json({ error: "proposal(newsUrl, slug 포함)이 필요합니다." }, { status: 400 })
  }
  const res = applyProposal(proposal)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
