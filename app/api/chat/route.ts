import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"

const UNAVAILABLE_MSG =
  "⚠️ AI 답변 기능은 현재 로컬 환경에서만 동작합니다.\n\n" +
  "위키 페이지에서 관련 문서를 직접 검색하거나, 지식 그래프를 통해 개념을 탐색해보세요."

function callClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["-p"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 90000,
    })

    let out = ""
    let err = ""

    proc.stdout.on("data", (d: Buffer) => { out += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { err += d.toString() })

    proc.on("error", () => resolve(""))
    proc.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out.trim())
      else if (err.trim() && !err.includes("command not found")) resolve(err.trim())
      else resolve("")
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 })

  const prompt =
    `드론 전문가로서 다음 질문에 한국어로 명확하고 정확하게 답변하세요. ` +
    `필요하면 표나 목록을 사용하세요.\n\n질문: ${question}`

  const answer = await callClaudeCli(prompt)

  return NextResponse.json({ answer: answer || UNAVAILABLE_MSG })
}
