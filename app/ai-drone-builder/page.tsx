"use client"

import { useEffect, useRef, useState } from "react"
import { getSessionStore } from "@/lib/session-store"
import { getSessionId } from "@/lib/session-id"
import { isGateStopText } from "@/lib/design-gate"

const KIND_LABEL = { "model-assumption": "⚠모델 가정값", simulation: "⚠시뮬레이션", "cited-secondary": "⚠2차 인용", derived: "파생 계산" }
import { designEvidence } from "@/lib/evidence"

// 2026-10-16: 6단계 + 단계별 사람 승인 게이트.
//   1 기획 → 2 HW 스펙 → 3 SW 스펙 → 4 기술 스펙(통합 검증) → 5 아키텍처 → 6 코드·로드맵
// 각 단계가 끝나면 멈추고 검토자가 승인/반려/마감을 고른다.
//   승인: 다음 단계 시작 / 반려: 사유와 직전 결과를 넣어 같은 단계를 다시 생성 /
//   마감(2~5단계): 현재 단계를 승인하고 여기서 종료, 승인된 단계까지 최종 문서로 묶는다.
// 한 번에 한 단계만 돌기 때문에(화면 이탈·타임아웃 위험이 단계 하나로 줄어든다) 단계마다
// 독립 요청이고, 진행 상태는 localStorage에 저장돼 새로고침 후에도 이어서 검토할 수 있다.

type StageKey = "proposal" | "hw" | "sw" | "techspec" | "architecture" | "implementation"
type StageStatus = "pending" | "running" | "review" | "approved" | "error" | "needs-input"

interface Rejection {
  text: string
  reason: string
}

interface StageState {
  text: string
  status: StageStatus
  error?: string
  rejections: Rejection[]
}

interface BuilderSnapshot {
  version: 2
  concept: string
  stages: Record<StageKey, StageState>
  closedAt: StageKey | null
}

const FEATURE_KEY = "drone-builder"

const STAGES: { key: StageKey; title: string; agent: string }[] = [
  { key: "proposal", title: "1. 기획", agent: "기획서 작성 에이전트" },
  { key: "hw", title: "2. HW 스펙", agent: "HW 스펙 에이전트" },
  { key: "sw", title: "3. SW 스펙", agent: "SW 스펙 에이전트" },
  { key: "techspec", title: "4. 기술 스펙", agent: "통합 검증 에이전트" },
  { key: "architecture", title: "5. 아키텍처", agent: "아키텍처 설계 에이전트" },
  { key: "implementation", title: "6. 코드 · 로드맵", agent: "소스코드 설계 에이전트" },
]

const EXAMPLES = [
  "산불 감시용 자율비행 드론",
  "GPS 없는 실내 물류창고 배송 드론",
  "군집비행 정찰 드론 시스템",
]

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: "대기",
  running: "생성 중",
  review: "검토 대기",
  approved: "승인됨",
  error: "오류",
  "needs-input": "입력 보완 필요",
}

function emptyStages(): Record<StageKey, StageState> {
  const make = (): StageState => ({ text: "", status: "pending", rejections: [] })
  return {
    proposal: make(),
    hw: make(),
    sw: make(),
    techspec: make(),
    architecture: make(),
    implementation: make(),
  }
}

// SSE(UI message stream)를 읽어 text-delta를 이어 붙인다. 오류 이벤트나 비정상 종료는 throw.
async function streamStage(
  body: unknown,
  onText: (full: string) => void,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch("/api/drone-builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`요청 실패 (HTTP ${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let full = ""
  let finished = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === "[DONE]") continue
      let evt: { type?: string; delta?: string; errorText?: string }
      try {
        evt = JSON.parse(payload)
      } catch {
        continue
      }
      if (evt.type === "text-delta" && evt.delta) {
        full += evt.delta
        onText(full)
      } else if (evt.type === "error") {
        throw new Error(evt.errorText || "AI 생성 중 오류가 발생했습니다.")
      } else if (evt.type === "finish") {
        finished = true
      }
    }
  }
  if (!finished) {
    throw new Error("서버 응답이 중간에 끊겼습니다(시간 초과 또는 연결 종료).")
  }
  return full
}

export default function AiDroneBuilderPage() {
  const [concept, setConcept] = useState("")
  const [stages, setStages] = useState<Record<StageKey, StageState>>(emptyStages)
  const [closedAt, setClosedAt] = useState<StageKey | null>(null)
  const [rejectingKey, setRejectingKey] = useState<StageKey | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [copied, setCopied] = useState(false)
  const [sessionId, setSessionId] = useState("")

  const restoredRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // 비동기 흐름(승인 직후 다음 단계 실행 등)에서 최신 상태를 읽기 위한 거울
  const stagesRef = useRef(stages)
  const conceptRef = useRef(concept)
  useEffect(() => {
    stagesRef.current = stages
    conceptRef.current = concept
  })

  const running = STAGES.some((s) => stages[s.key].status === "running")

  const patchStage = (key: StageKey, patch: Partial<StageState>) => {
    setStages((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  // 세션 복원: 정적 프리렌더와의 하이드레이션 불일치를 피하려고 마운트 후 effect에서만 복원한다.
  useEffect(() => {
    const sid = getSessionId()
    setSessionId(sid)
    if (sid) {
      const saved = getSessionStore().loadSnapshot<BuilderSnapshot>(sid, FEATURE_KEY)
      if (saved && saved.version === 2) {
        const restored = { ...emptyStages(), ...saved.stages }
        // 생성 중에 화면을 떠났다면 요청은 이미 죽었으므로 오류로 바꿔 "다시 시도"를 띄운다.
        for (const s of STAGES) {
          if (restored[s.key].status === "running") {
            restored[s.key] = {
              ...restored[s.key],
              status: "error",
              error: "생성 중 화면을 벗어나 중단됐습니다. 다시 시도해 주세요.",
            }
          }
        }
        setConcept(saved.concept)
        setStages(restored)
        setClosedAt(saved.closedAt ?? null)
      }
    }
    restoredRef.current = true
    return () => abortRef.current?.abort()
  }, [])

  // 세션 저장(0.4초 디바운스): 스트리밍 중 델타마다 쓰지 않도록 한다.
  useEffect(() => {
    if (!restoredRef.current || !sessionId) return
    const t = setTimeout(() => {
      getSessionStore().saveSnapshot<BuilderSnapshot>(sessionId, FEATURE_KEY, {
        version: 2,
        concept,
        stages,
        closedAt,
      })
    }, 400)
    return () => clearTimeout(t)
  }, [concept, stages, closedAt, sessionId])

  // 직전까지의 단계 결과를 서버 컨텍스트로 만든다(해당 단계 이전 것만 의미가 있다).
  const buildContext = (feedback?: { previous: string; reason: string }) => {
    const st = stagesRef.current
    return {
      proposal: st.proposal.text,
      hw: st.hw.text,
      sw: st.sw.text,
      techspec: st.techspec.text,
      architecture: st.architecture.text,
      ...(feedback ? { feedback } : {}),
    }
  }

  const runStage = async (key: StageKey, feedback?: { previous: string; reason: string }) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    patchStage(key, { text: "", status: "running", error: undefined })
    try {
      const full = await streamStage(
        { prompt: conceptRef.current, stage: key, context: buildContext(feedback) },
        (text) => patchStage(key, { text }),
        controller.signal
      )
      // 서버 게이트의 재질문·불가 판정이면 승인 단계로 넘기지 않고 컨셉 보완을 요구한다.
      patchStage(key, { status: isGateStopText(full) ? "needs-input" : "review" })
    } catch (e) {
      if (controller.signal.aborted) return
      patchStage(key, {
        status: "error",
        error: e instanceof Error ? e.message : "알 수 없는 오류",
      })
    }
  }

  const start = () => {
    if (!concept.trim() || running) return
    setStages(emptyStages())
    setClosedAt(null)
    setRejectingKey(null)
    // setState 반영 후 실행되도록 다음 틱에 시작
    setTimeout(() => runStage("proposal"), 0)
  }

  const approve = (key: StageKey) => {
    patchStage(key, { status: "approved" })
    const idx = STAGES.findIndex((s) => s.key === key)
    const next = STAGES[idx + 1]
    if (next) setTimeout(() => runStage(next.key), 0)
  }

  const close = (key: StageKey) => {
    patchStage(key, { status: "approved" })
    setClosedAt(key)
  }

  const reject = (key: StageKey) => {
    const current = stagesRef.current[key]
    const reason = rejectReason.trim()
    patchStage(key, { rejections: [...current.rejections, { text: current.text, reason }] })
    setRejectingKey(null)
    setRejectReason("")
    setTimeout(() => runStage(key, { previous: current.text, reason }), 0)
  }

  const retry = (key: StageKey) => {
    setTimeout(() => runStage(key), 0)
  }

  // 최종 문서: 승인된 단계를 순서대로 이어 붙인다.
  const approvedStages = STAGES.filter((s) => stages[s.key].status === "approved")
  const lastKey = STAGES[STAGES.length - 1].key
  const finished = closedAt !== null || stages[lastKey].status === "approved"
  const finalDoc = approvedStages
    .map((s) => `# ${s.title} — ${s.agent}\n\n${stages[s.key].text.trim()}`)
    .join("\n\n---\n\n")

  const copyFinal = async () => {
    try {
      await navigator.clipboard.writeText(`# ${concept}\n\n${finalDoc}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const reached = (key: StageKey) => stages[key].status !== "pending"

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">🚀 AI 드론 빌더</h1>
      <p className="text-sm text-slate-500 mb-6">
        드론 컨셉 한 줄을 입력하면 <strong>기획 → HW 스펙 → SW 스펙 → 기술 스펙 → 아키텍처 → 코드·로드맵</strong>{" "}
        6단계 에이전트가 DroneWiki 지식 베이스(GraphRAG)를 근거로 협업합니다. 각 단계가 끝나면 멈추고,
        <strong> 승인 · 반려 · 마감</strong>을 선택해 다음으로 넘어갑니다.
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
            disabled={!concept.trim() || running}
            className="px-5 py-2.5 bg-signal-500 hover:bg-signal-500/100 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            {running ? "에이전트 작업 중..." : "🤖 1단계 시작"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {STAGES.map((s, idx) => {
          const st = stages[s.key]
          const isLast = idx === STAGES.length - 1
          const skipped = closedAt !== null && !reached(s.key)
          if (skipped) return null
          return (
            <div
              key={s.key}
              className={`border rounded-xl overflow-hidden transition-colors ${
                st.status === "running" || st.status === "review"
                  ? "border-signal-400"
                  : st.status === "approved"
                    ? "border-slate-200 dark:border-slate-700"
                    : st.status === "error"
                      ? "border-red-300 dark:border-red-800"
                      : st.status === "needs-input"
                        ? "border-amber-400"
                      : "border-dashed border-slate-200 dark:border-slate-700 opacity-50"
              }`}
            >
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-sm font-semibold">
                <span>
                  {st.status === "approved" ? "✅" : st.status === "running" ? "⏳" : st.status === "review" ? "📝" : st.status === "error" ? "⚠️" : st.status === "needs-input" ? "✋" : "⏸️"}
                </span>
                <span>{s.title}</span>
                <span className="text-xs font-normal text-slate-400">— {s.agent}</span>
                <span className="ml-auto text-xs font-normal text-slate-500">
                  {STATUS_LABEL[st.status]}
                  {st.rejections.length > 0 ? ` · 반려 ${st.rejections.length}회` : ""}
                </span>
              </div>

              {st.status !== "pending" && (
                <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                  {st.text || "대기 중..."}
                </div>
              )}

              {st.status !== "pending" && s.key !== "proposal" && st.text && !isGateStopText(st.text) && (
                <details className="px-4 pb-3">
                  <summary className="text-xs text-slate-500 cursor-pointer select-none">
                    📐 설계 근거 · 공학 규칙 (원문 대조 claim) — 이 단계의 수치가 의존하는 규칙과 출처
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {designEvidence().map((r) => (
                      <div key={r.id} className="text-[11px] text-slate-500 border-l-2 border-dashed border-slate-300 pl-2">
                        <p>
                          <b>{r.id}</b> {r.name} <code>{r.formula}</code> · 근거 상태 <b>{r.sourceStatus}</b>
                        </p>
                        {r.claims.slice(0, 4).map((c) => (
                          <p key={c.id} className="ml-2">
                            · {c.kind && c.kind !== "reported" ? `[${(KIND_LABEL as Record<string, string>)[c.kind] ?? c.kind}] ` : ""}{c.subject}: {c.value} ({c.source}, {c.status}){c.quote ? ` — “${c.quote.slice(0, 120)}”` : ""}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {st.status === "error" && (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    ⚠️ {st.error || "오류가 발생했습니다."}
                  </div>
                  <div>
                    <button
                      onClick={() => retry(s.key)}
                      disabled={running}
                      className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-white disabled:opacity-40"
                    >
                      이 단계 다시 시도
                    </button>
                  </div>
                </div>
              )}

              {st.status === "review" && (
                <div className="px-4 pb-4 flex flex-col gap-3">
                  {rejectingKey === s.key ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="반려 사유 (선택) — 예: 배터리 용량이 체공시간 요구에 부족함"
                        className="min-h-[64px] border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-signal-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => reject(s.key)}
                          className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white"
                        >
                          반려하고 다시 생성
                        </button>
                        <button
                          onClick={() => {
                            setRejectingKey(null)
                            setRejectReason("")
                          }}
                          className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => approve(s.key)}
                        className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-semibold"
                      >
                        {isLast ? "✅ 승인 (완료)" : "✅ 승인 → 다음 단계"}
                      </button>
                      <button
                        onClick={() => setRejectingKey(s.key)}
                        className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-semibold"
                      >
                        ↩️ 반려
                      </button>
                      {idx > 0 && !isLast && (
                        <button
                          onClick={() => close(s.key)}
                          className="px-4 py-2 text-sm rounded-lg border border-slate-400 dark:border-slate-500 font-semibold"
                        >
                          🔒 마감 (여기서 종료)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {st.rejections.length > 0 && (
                <details className="px-4 pb-3 text-xs text-slate-500">
                  <summary className="cursor-pointer">반려 이력 {st.rejections.length}건</summary>
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    {st.rejections.map((r, i) => (
                      <li key={i}>{r.reason || "(사유 없음)"}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )
        })}
      </div>

      {finished && approvedStages.length > 0 && (
        <div className="mt-8 border border-emerald-300 dark:border-emerald-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-sm font-semibold">
            <span>📄 최종 문서</span>
            <span className="text-xs font-normal text-slate-500">
              승인된 {approvedStages.length}단계{closedAt ? " · 마감됨" : ""}
            </span>
            <button
              onClick={copyFinal}
              className="ml-auto px-3 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-600"
            >
              {copied ? "복사됨 ✓" : "마크다운 복사"}
            </button>
          </div>
          <pre className="p-4 text-xs whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
            {`# ${concept}\n\n${finalDoc}`}
          </pre>
        </div>
      )}
    </div>
  )
}
