import { NextRequest, NextResponse } from "next/server"
import { isReviewWritable, loadReviewState, saveReviewState } from "@/lib/discovery-review"

export async function POST(req: NextRequest) {
  if (!isReviewWritable()) {
    return NextResponse.json(
      { error: "이 기능은 로컬 개발 환경에서만 사용할 수 있습니다." },
      { status: 403 }
    )
  }

  const { nodeId }: { nodeId: string } = await req.json()
  if (!nodeId) {
    return NextResponse.json({ error: "nodeId가 필요합니다." }, { status: 400 })
  }

  const state = loadReviewState()
  state[nodeId] = { status: "rejected", at: new Date().toISOString() }
  saveReviewState(state)

  return NextResponse.json({ ok: true })
}
