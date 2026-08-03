"use client"

import { useRef, useState } from "react"
import { useCompletion } from "@ai-sdk/react"

type Stage = "idle" | "proposal" | "spec" | "architecture" | "done"

const STAGE_META: Record<Exclude<Stage, "idle" | "done">, { title: string; agent: string }> = {
  proposal: { title: "1. 기획서", agent: "기획서 작성 에이전트" },
  spec: { title: "2. 기술 스펙", agent: "스펙 정의 에이전트" },
  architecture: { title: "3. 아키텍처 · 코드", agent: "아키텍처·소스코드 설계 에이전트" },
}

const EXAMPLES = [
  "산불 감시용 자율비행 드론",
  "GPS 없는 실내 물류창고 배송 드론",
  "군집비행 정찰 드론 시스템",
]

export default function AiDroneBuilderPage() {
  const [concept, setConcept] = useState("")
  const [proposal, setProposal] = useState("")
  const [spec, setSpec] = useState("")
  const [architecture, setArchitecture] = useState("")
  const [stage, setStage] = useState<Stage>("idle")

  // onFinish 클로저가 stale state를 참조하지 않도록 진행 상태는 ref로도 들고 있는다.
  const stageRef = useRef<Stage>("idle")
  const proposalRef = useRef("")
  const specRef = useRef("")

  const { completion, complete, isLoading, error } = useCompletion({
    api: "/api/drone-builder",
    onFinish: (_prompt, text) => {
      if (stageRef.current === "proposal") {
        proposalRef.current = text
        setProposal(text)
        stageRef.current = "spec"
        setStage("spec")
        complete(concept, { body: { stage: "spec", context: { proposal: text } } })
      } else if (stageRef.current === "spec") {
        specRef.current = text
        setSpec(text)
        stageRef.current = "architecture"
        setStage("architecture")
        complete(concept, {
          body: { stage: "architecture", context: { proposal: proposalRef.current, spec: text } },
        })
      } else if (stageRef.current === "architecture") {
        setArchitecture(text)
        stageRef.current = "done"
        setStage("done")
      }
    },
  })

  const start = () => {
    if (!concept.trim() || isLoading) return
    setProposal("")
    setSpec("")
    setArchitecture("")
    proposalRef.current = ""
    specRef.current = ""
    stageRef.current = "proposal"
    setStage("proposal")
    complete(concept, { body: { stage: "proposal" } })
  }

  const stages: Exclude<Stage, "idle" | "done">[] = ["proposal", "spec", "architecture"]
  const textFor = (s: Exclude<Stage, "idle" | "done">) => {
    if (s === "proposal") return stage === "proposal" ? completion : proposal
    if (s === "spec") return stage === "spec" ? completion : spec
    return stage === "architecture" ? completion : architecture
  }
  const isStageDone = (s: Exclude<Stage, "idle" | "done">) => {
    if (s === "proposal") return stage !== "idle" && stage !== "proposal"
    if (s === "spec") return stage === "architecture" || stage === "done"
    return stage === "done"
  }
  const isStageActive = (s: Exclude<Stage, "idle" | "done">) => stage === s

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">🚀 AI 드론 빌더</h1>
      <p className="text-sm text-slate-500 mb-6">
        드론 컨셉 한 줄을 입력하면 <strong>기획서 작성 → 스펙 정의 → 아키텍처·코드 설계</strong> 3개 에이전트가
        DroneWiki 지식 베이스(GraphRAG)를 근거로 순차 협업해 결과물을 만듭니다.
      </p>

      <div className="flex flex-col gap-2 mb-8">
        <textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="예: AI 드론을 기획하고 개발해줘 — 산불 감시용 자율비행 드론"
          className="min-h-[80px] border border-slate-300 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setConcept(ex)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:border-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <div>
          <button
            onClick={start}
            disabled={!concept.trim() || isLoading}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {isLoading ? `${STAGE_META[stage as keyof typeof STAGE_META]?.agent ?? "실행"} 작업 중...` : "🤖 3단계 에이전트 실행"}
          </button>
        </div>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            ⚠️ {error.message || "오류가 발생했습니다."}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {stages.map((s) => {
          const meta = STAGE_META[s]
          const text = textFor(s)
          const active = isStageActive(s)
          const done = isStageDone(s)
          return (
            <div
              key={s}
              className={`border rounded-xl overflow-hidden transition-colors ${
                active
                  ? "border-cyan-400"
                  : done
                    ? "border-slate-200 dark:border-slate-700"
                    : "border-dashed border-slate-200 dark:border-slate-700 opacity-50"
              }`}
            >
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-sm font-semibold">
                <span>{done ? "✅" : active ? "⏳" : "⏸️"}</span>
                <span>{meta.title}</span>
                <span className="text-xs font-normal text-slate-400">— {meta.agent}</span>
              </div>
              {(active || done) && (
                <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                  {text || "대기 중..."}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
