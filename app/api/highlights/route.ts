import { NextRequest, NextResponse } from "next/server"
import { appendHighlight, isHighlightWritable } from "@/lib/highlights"

export async function POST(req: NextRequest) {
  if (!isHighlightWritable()) {
    return NextResponse.json(
      { error: "이 기능은 로컬 개발 환경에서만 사용할 수 있습니다." },
      { status: 403 }
    )
  }

  const { sourceSlug, sourceTitle, text }: { sourceSlug: string; sourceTitle: string; text: string } =
    await req.json()

  if (!sourceSlug || !text?.trim()) {
    return NextResponse.json({ error: "sourceSlug와 text가 필요합니다." }, { status: 400 })
  }

  const entry = appendHighlight({ sourceSlug, sourceTitle: sourceTitle ?? "", text: text.trim() })
  return NextResponse.json({ ok: true, entry })
}
