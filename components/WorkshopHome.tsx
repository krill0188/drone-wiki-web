"use client"
import Link from "next/link"
import WorkshopScene from "@/components/WorkshopScene"
import DroneIcon from "@/components/DroneIcon"
import { NAV } from "@/lib/nav"

// 홈(작업실 스킨): 장면 + 한 줄 소개 + 서랍 메뉴(5개 메뉴와 하위 메뉴가 한눈에 보이게) + 상태.
const DESC: Record<string, string> = {
  ask: "출처와 함께 답해요. 사양표는 코드가 직접 그려서 숫자가 틀리지 않아요.",
  design: "기획안부터 코드 뼈대까지 6단계 설계도를 같이 만들어요.",
  explore: "위키·용어 관계 지도·뉴스를 서랍처럼 열어 보고, AI 에디터로 글을 정리해요.",
  evidence: "자료를 얼마나 믿을 수 있는지, 추측으로 만든 지도는 무엇인지 확인해요.",
  about: "한눈에 보기 그림, 운영 상태, 최근에 바뀐 것을 봐요.",
}

export default function WorkshopHome({ docs, rules }: { docs: number; rules: number }) {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-8">
      {/* 사이트 이름과 한 줄 소개(기존 홈 문구 유지) */}
      <header className="mb-4">
        <div className="flex items-center gap-2.5">
          <DroneIcon className="w-9 h-9 text-ink" />
          <span className="font-display font-bold text-3xl sm:text-4xl tracking-tight">DroneWiki</span>
        </div>
        <p className="mt-1.5 text-ink-dim text-sm sm:text-[15px] break-keep">
          드론 비행제어·통신·하드웨어·GCS·법규·AI 자율 — 모든 드론 지식을 AI와 함께
        </p>
      </header>
      <WorkshopScene />
      <p className="text-[12.5px] text-ink-dim mt-2">
        일러스트예요(사진 아님). 평소에는 가만히 있고, 모니터를 누르거나 청사진·드론에 마우스를 올리면 움직여요.
      </p>

      <section className="mt-6 flex flex-wrap items-end justify-between gap-4" aria-labelledby="ws-h1">
        <div className="min-w-0">
          <h1 id="ws-h1" className="font-display font-bold text-2xl sm:text-3xl leading-tight tracking-tight break-keep text-balance">
            드론 설계, <span className="whitespace-nowrap text-signal-600 underline decoration-signal-500/40 decoration-4 underline-offset-4">출처와 함께</span> 도와드려요
          </h1>
          <p className="mt-2 text-ink-dim max-w-xl text-[15px] break-keep">
            질문하면 확인된 자료로만 답하고, 설계는 계산으로 먼저 따져 봐요. 모르는 건 “다시 확인 필요”라고 말해요.
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link href="/chat" className="inline-flex items-center px-5 py-2.5 rounded-md bg-signal-500 text-white font-semibold text-[15px]">질문하러 가기</Link>
          <Link href="/ai-drone-builder" className="inline-flex items-center px-5 py-2.5 rounded-md border-2 border-ink text-ink font-semibold text-[15px] hover:bg-ink hover:text-paper transition-colors">설계 시작</Link>
        </div>
      </section>

      <nav aria-label="메뉴 서랍" className="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {NAV.map((g) => {
          const href = g.href ?? g.children?.[0]?.href ?? "/"
          return (
            <div key={g.key} className="ws-drawer">
              <Link href={href} className="block outline-offset-4 focus-visible:outline-2">
                <span className="text-2xl" aria-hidden>{g.icon}</span>
                <h2 className="mt-1.5 font-display font-bold text-[18px] leading-tight">{g.label}</h2>
                <p className="mt-1 text-[13.5px] text-ink-dim leading-snug">{DESC[g.key]}</p>
              </Link>
              {g.children && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {g.children.map((c) => (
                    <Link key={c.href} href={c.href} className="ws-child">{c.label}</Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-2 border-dashed border-line rounded-md px-4 py-3 text-[14px]">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5" aria-hidden />매일 아침 자동 점검</span>
        <span>글 <b className="font-hud text-[17px]">{docs.toLocaleString()}</b>쪽</span>
        <span>공학 규칙 <b className="font-hud text-[17px]">{rules}</b>개 구현</span>
        <Link href="/about" className="ml-auto text-signal-600 hover:underline">운영 상태와 한눈에 보기 →</Link>
      </div>
    </div>
  )
}
