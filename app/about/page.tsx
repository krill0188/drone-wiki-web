import fs from "node:fs"
import path from "node:path"
import Link from "next/link"
import HealthStatus from "./HealthStatus"

// 소개: 한눈에 보기(손글씨 모션 그림), 운영 상태, 최근 변경. 쉬운 말로 쓴다.
export const dynamic = "force-static"
export const metadata = { title: "소개 — DroneWiki" }

function recentChanges(): { title: string; lines: string[] } | null {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "docs", "RELEASES.md"), "utf-8")
    const i = raw.indexOf("## ")
    if (i < 0) return null
    const block = raw.slice(i).split(/\n## /)[0]
    const lines = block.split("\n")
    return { title: lines[0].replace(/^##\s*/, ""), lines: lines.slice(1).filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- /, "").replace(/`/g, "")).slice(0, 8) }
  } catch {
    return null
  }
}

export default function AboutPage() {
  const rel = recentChanges()
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold">DroneWiki 소개</h1>
        <p className="mt-2 text-ink-dim">
          드론 자료를 믿을 수 있는 출처와 함께 답하는 서비스입니다. 답은 출처가 확인된 자료에서만 나오고, AI는 그 자료를 쉬운 말로 풀어 쓰는 역할만 합니다.
        </p>
      </header>

      <section className="border border-line rounded-xl bg-panel p-5">
        <h2 className="font-display text-lg font-bold">한눈에 보기</h2>
        <p className="mt-1 text-sm text-ink-dim">자료가 답이 되는 길, 질문 한 번의 여정, 고장 났을 때의 예비 길을 손글씨 그림으로 볼 수 있어요. 어려운 말은 쉬운 말로 바꿨습니다.</p>
        <Link href="/overview.html" className="inline-block mt-3 text-sm font-medium text-signal-600 hover:underline">
          그림으로 보기 →
        </Link>
      </section>

      <section className="border border-line rounded-xl bg-panel p-5">
        <h2 className="font-display text-lg font-bold">지금 잘 돌아가고 있나요?</h2>
        <HealthStatus />
      </section>

      {rel && (
        <section className="border border-line rounded-xl bg-panel p-5">
          <h2 className="font-display text-lg font-bold">최근에 바뀐 것</h2>
          <p className="mt-1 text-xs font-hud text-ink-dim">{rel.title}</p>
          <ul className="mt-2 list-disc pl-5 text-sm flex flex-col gap-1">
            {rel.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="text-sm text-ink-dim">
        <h2 className="font-display text-lg font-bold text-ink">메뉴 안내</h2>
        <ul className="mt-2 flex flex-col gap-1">
          <li><b className="text-ink">질문하기</b> — 드론 지식을 물어보면 출처와 함께 답합니다.</li>
          <li><b className="text-ink">설계 도우미</b> — 조건을 넣으면 6단계(기획안부터 코드 뼈대까지)로 설계를 도와줍니다.</li>
          <li><b className="text-ink">자료 탐색</b> — 위키, 지식그래프, 뉴스를 둘러보고 AI 에디터로 글을 정리합니다.</li>
          <li><b className="text-ink">근거 센터</b> — 자료가 얼마나 믿을 만한지, 추측으로 만든 지도가 무엇인지 확인합니다.</li>
        </ul>
      </section>
    </div>
  )
}
