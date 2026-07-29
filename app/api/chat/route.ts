import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 })

  try {
    const { stdout, stderr } = await execAsync(
      `claude -p ${JSON.stringify(
        `드론 전문가로서 다음 질문에 한국어로 명확하고 정확하게 답변하세요. 필요하면 표나 목록을 사용하세요.\n\n질문: ${question}`
      )}`,
      { timeout: 90000 }
    )
    const answer = stdout.trim() || stderr.trim() || "답변을 생성하지 못했습니다."
    return NextResponse.json({ answer })
  } catch (err: any) {
    return NextResponse.json({ answer: `오류: ${err.message}` }, { status: 500 })
  }
}
