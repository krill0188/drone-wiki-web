import { NextResponse } from "next/server"
import { getPendingReviewItems, isReviewWritable, loadReviewState } from "@/lib/discovery-review"

export async function GET() {
  const pending = getPendingReviewItems()
  const state = loadReviewState()
  const values = Object.values(state)

  return NextResponse.json({
    writable: isReviewWritable(),
    pending,
    promotedCount: values.filter((s) => s.status === "promoted").length,
    rejectedCount: values.filter((s) => s.status === "rejected").length,
  })
}
