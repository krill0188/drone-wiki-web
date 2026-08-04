import { NextResponse } from "next/server"
import { getAugmentedKnowledgeGraph } from "@/lib/wiki"

export async function GET() {
  const graph = await getAugmentedKnowledgeGraph()
  return NextResponse.json(graph)
}
