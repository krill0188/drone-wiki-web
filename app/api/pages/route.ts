import { NextResponse } from "next/server"
import { getAllPages } from "@/lib/wiki"

export async function GET() {
  const pages = await getAllPages()
  return NextResponse.json(pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    domain: p.domain,
    layer: p.layer,
    tags: p.tags,
    updated: p.updated,
    confidence: p.confidence,
  })))
}
