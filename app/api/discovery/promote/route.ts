import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import { WIKI_ROOT, isReviewWritable, loadReviewState, saveReviewState, slugify } from "@/lib/discovery-review"

function runUpdateGraph(): Promise<string> {
  return new Promise((resolve) => {
    const script = path.join(WIKI_ROOT, "scripts", "update-graph.sh")
    if (!fs.existsSync(script)) {
      resolve("update-graph.sh 없음 — canonical 그래프는 다음 예정된 갱신 때 반영됩니다.")
      return
    }
    execFile("bash", [script], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) resolve(`⚠️ update-graph.sh 실행 실패: ${stderr || err.message}`)
      else resolve(stdout.trim())
    })
  })
}

export async function POST(req: NextRequest) {
  if (!isReviewWritable()) {
    return NextResponse.json(
      { error: "이 기능은 로컬 개발 환경에서만 사용할 수 있습니다(배포된 사이트에서는 위키 문서를 쓸 수 없습니다)." },
      { status: 403 }
    )
  }

  const {
    nodeId,
    layer,
    slug: rawSlug,
    markdown,
  }: { nodeId: string; layer: "concepts" | "entities"; slug: string; markdown: string } = await req.json()

  if (!nodeId || !markdown?.trim()) {
    return NextResponse.json({ error: "nodeId와 markdown이 필요합니다." }, { status: 400 })
  }

  const targetLayer = layer === "entities" ? "entities" : "concepts"
  const slug = slugify(rawSlug || nodeId)
  if (!slug) {
    return NextResponse.json({ error: "유효한 slug를 만들 수 없습니다." }, { status: 400 })
  }

  const dir = path.join(WIKI_ROOT, targetLayer)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${slug}.md`)

  if (fs.existsSync(filePath)) {
    return NextResponse.json({ error: `이미 존재하는 문서입니다: ${targetLayer}/${slug}.md` }, { status: 409 })
  }

  fs.writeFileSync(filePath, markdown.endsWith("\n") ? markdown : `${markdown}\n`)

  const state = loadReviewState()
  state[nodeId] = { status: "promoted", slug, layer: targetLayer, at: new Date().toISOString() }
  saveReviewState(state)

  const graphUpdateOutput = await runUpdateGraph()

  return NextResponse.json({ ok: true, path: `${targetLayer}/${slug}.md`, graphUpdateOutput })
}
