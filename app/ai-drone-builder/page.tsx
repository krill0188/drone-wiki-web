"use client"

import { useEffect, useRef, useState } from "react"
import { useCompletion } from "@ai-sdk/react"
import { getSessionStore } from "@/lib/session-store"
import { getSessionId } from "@/lib/session-id"

type Stage = "idle" | "proposal" | "spec" | "architecture" | "done"

const FEATURE_KEY = "drone-builder"

interface BuilderSnapshot {
  concept: string
  stage: Stage
  proposal: string
  spec: string
  architecture: string
}

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
  const [stage, setStage] = useState<Stage>("idle")
  const [sessionId, setSessionId] = useState("")
  const restoredRef = useRef(false)

  const proposalRef = useRef("")
  const specRef = useRef("")

  // 3단계를 useCompletion 하나로 재귀 체이닝하면(onFinish 안에서 같은 훅의 complete를
  // 다시 호출) 세 단계가 completionId(=SWR 캐시 키)를 공유해서 상태가 서로 덮어써진다
  // (실제로 프로덕션에서 재현됨: stage1→2는 되지만 2→3에서 요청 자체가 안 나감).
  // 단계마다 독립된 id를 준 별도 훅 3개로 분리해 상태 충돌을 원천 차단한다.
  const proposalHook = useCompletion({
    id: "drone-builder-proposal",
    api: "/api/drone-builder",
    onFinish: (_prompt, text) => {
      proposalRef.current = text
      setStage("spec")
      specHook.complete(concept, { body: { stage: "spec", context: { proposal: text } } })
    },
  })

  const specHook = useCompletion({
    id: "drone-builder-spec",
    api: "/api/drone-builder",
    onFinish: (_prompt, text) => {
      specRef.current = text
      setStage("architecture")
      archHook.complete(concept, {
        body: { stage: "architecture", context: { proposal: proposalRef.current, spec: text } },
      })
    },
  })

  const archHook = useCompletion({
    id: "drone-builder-architecture",
    api: "/api/drone-builder",
    onFinish: () => setStage("done"),
  })

  const hooks = { proposal: proposalHook, spec: specHook, architecture: archHook } as const
  const busy = proposalHook.isLoading || specHook.isLoading || archHook.isLoading
  const error = proposalHook.error || specHook.error || archHook.error

  // 세션 복원(2026-08-08): 이 페이지는 정적 프리렌더 대상이라, 저장된 값을 훅
  // 초기값으로 곧장 넣으면 서버가 그린 빈 상태와 클라이언트 첫 렌더가 달라져
  // 하이드레이션 불일치가 난다(Chat.tsx에서 실측 확인된 것과 동일한 함정). 서버와
  // 동일한 빈 상태로 먼저 하이드레이션을 마친 뒤, 마운트 후 effect에서만 복원한다.
  // 진행 중이던 스트리밍 자체는 재개할 수 없으므로(원 요청이 죽음) 텍스트만
  // 복원하고 "실행" 버튼을 다시 눌러야 이어서 생성된다.
  useEffect(() => {
    const sid = getSessionId()
    setSessionId(sid)
    if (sid) {
      const saved = getSessionStore().loadSnapshot<BuilderSnapshot>(sid, FEATURE_KEY)
      if (saved) {
        setConcept(saved.concept)
        setStage(saved.stage)
        proposalHook.setCompletion(saved.proposal)
        specHook.setCompletion(saved.spec)
        archHook.setCompletion(saved.architecture)
        proposalRef.current = saved.proposal
        specRef.current = saved.spec
      }
    }
    restoredRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 세션 저장: 진행 상태가 바뀔 때마다 localStorage(외부 시스템)에 동기화한다.
  useEffect(() => {
    if (!restoredRef.current || !sessionId) return
    getSessionStore().saveSnapshot<BuilderSnapshot>(sessionId, FEATURE_KEY, {
      concept,
      stage,
      proposal: proposalHook.completion,
      spec: specHook.completion,
      architecture: archHook.completion,
    })
  }, [concept, stage, proposalHook.completion, specHook.completion, archHook.completion, sessionId])

  const start = () => {
    if (!concept.trim() || busy) return
    proposalRef.current = ""
    specRef.current = ""
    proposalHook.setCompletion("")
    specHook.setCompletion("")
    archHook.setCompletion("")
    setStage("proposal")
    proposalHook.complete(concept, { body: { stage: "proposal" } })
  }

  const stages: Exclude<Stage, "idle" | "done">[] = ["proposal", "spec", "architecture"]
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
          className="min-h-[80px] border border-slate-300 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-signal-400 resize-none"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setConcept(ex)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:border-signal-400 hover:text-signal-500 dark:hover:text-signal-400 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <div>
          <button
            onClick={start}
            disabled={!concept.trim() || busy}
            className="px-5 py-2.5 bg-signal-500 hover:bg-signal-500/100 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {busy && stage !== "idle" && stage !== "done"
              ? `${STAGE_META[stage as keyof typeof STAGE_META]?.agent ?? "실행"} 작업 중...`
              : "🤖 3단계 에이전트 실행"}
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
          const text = hooks[s].completion
          const active = isStageActive(s)
          const done = isStageDone(s)
          return (
            <div
              key={s}
              className={`border rounded-xl overflow-hidden transition-colors ${
                active
                  ? "border-signal-400"
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
