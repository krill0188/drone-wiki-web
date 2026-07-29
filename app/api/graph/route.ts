import { NextResponse } from "next/server"
import { getKnowledgeGraph } from "@/lib/wiki"

export async function GET() {
  const graph = getKnowledgeGraph()
  return NextResponse.json(graph)
}
