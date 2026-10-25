"use client"

import { motion } from "framer-motion"
import MarkdownText from "./MarkdownText"
import WaitingIndicator, { TypingDots } from "./WaitingIndicator"
import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import ConsentGate from "@/components/ConsentGate"
import { authHeader } from "@/lib/supabase-browser"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useWikiDoc } from "@/components/WikiDocContext"
import { DOMAIN_META } from "@/lib/types"
import DroneIcon from "@/components/DroneIcon"
import { getSessionStore } from "@/lib/session-store"
import { getSessionId } from "@/lib/session-id"

import { buildTextFragmentUrl } from "@/lib/text-fragment"

const CHAT_FEATURE_KEY = "chat"

interface ChatMetadata {
  sources?: { slug: string; title: string; domain: string; excerpt?: string; origin?: "canonical" | "raw"; sourceUrl?: string }[]
  newsSources?: { title: string; url: string; type: string }[]
  kgFacts?: { id: string; text: string; source?: string }[]
  answerMeta?: {
    basis?: "ontology" | "ontology-linked" | "wiki-sourced" | "none"
    status: "answered" | "insufficient_evidence" | "unverified"
    confidence: "high" | "medium" | "low"
    contested: boolean
    domain: string[]
    limitations: string[]
    suggestions?: string[]
    ontology: { classes: string[]; entities: { id: string; label: string; class: string }[]; relations: { id: string; subject: string; predicate: string; object: string; status: string; confidence: string }[] }
    claims: { id: string; subject: string; predicate: string; value: string; status: string; confidence: string; evidence_kind: string; contested: boolean; origin: string }[]
    evidence: { source_path: string; source_url: string; locator: string; quote: string; claim_id: string; verified: boolean }[]
    canonical_pages: { path: string; title: string; domain: string | null }[]
    verification: { ok: boolean; violations: { code: string; detail: string }[]; retried: boolean }
  }
  evidence?: { id: string; name: string; formula: string; sourceStatus: string; claims: { id: string; subject: string; value: string; source: string; locator: string; quote: string; status: string; kind?: string }[] }[]
}

type ChatUIMessage = UIMessage<ChatMetadata>

const EXAMPLES = [
  "PX4와 ArduPilot의 차이점은?",
  "MAVLink 프로토콜이란 무엇인가요?",
  "드론 비행 컨트롤러 선택 기준",
]

// GPT/Gemini 벤치마킹 결론(장식 없이 입력창 중심, 무채색 배경+포인트 컬러 1개)을
// 그대로 따르되, 두 가지는 드론 지식베이스 전용 서비스라는 걸 보여주는 지점이라
// 일부러 다르게 간다: (1) GraphRAG 인용 배지로 "그냥 LLM이 아니다"를 드러내고,
// (2) 로딩 상태를 레이더 스캔 문구로 바꿔 실제 파이프라인(RAG→그래프→생성)을 보여준다.

// 화면 우측에 고정되는 실시간 스트리밍 AI 챗봇. 위키 문서를 보는 중이면
// WikiDocContext에서 현재 문서를 읽어 매 요청마다 함께 전송한다(문서 기반 대화).
export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const { doc, pendingAsk, clearPendingAsk } = useWikiDoc()
  const endRef = useRef<HTMLDivElement>(null)
  const [sessionId, setSessionId] = useState("")
  const restoredRef = useRef(false)

  const { messages, setMessages, sendMessage, status, error } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat", headers: async () => await authHeader() }),
  })

  // 세션 복원(2026-08-08): 이 컴포넌트는 SSR/정적 프리렌더 대상이라, 저장된 대화를
  // 훅 초기값으로 곧장 넣으면(useState(() => loadSavedMessages())) 서버가 그린 빈
  // 상태와 클라이언트 첫 렌더가 달라져 하이드레이션 불일치가 난다(실측 확인됨 —
  // Next.js "Recoverable Error: Hydration failed"). 그래서 서버와 동일한 빈 상태로
  // 먼저 하이드레이션을 마친 뒤, 마운트 후 effect에서만 복원한다 — 이 컴포넌트가
  // 항상 정적으로 프리렌더되는 한 하이드레이션 안전을 위해 필요한 예외다.
  useEffect(() => {
    const sid = getSessionId()
    setSessionId(sid)
    if (sid) {
      const saved = getSessionStore().loadSnapshot<ChatUIMessage[]>(sid, CHAT_FEATURE_KEY)
      if (saved && saved.length > 0) setMessages(saved)
    }
    restoredRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 세션 저장: 대화가 바뀔 때마다 localStorage(외부 시스템)에 동기화한다. 복원이
  // 끝나기 전에는 건너뛴다 — 안 그러면 마운트 직후의 빈 messages가 저장분을 덮어쓴다.
  useEffect(() => {
    if (!restoredRef.current || !sessionId) return
    getSessionStore().saveSnapshot(sessionId, CHAT_FEATURE_KEY, messages)
  }, [messages, sessionId])

  const busy = status === "submitted" || status === "streaming"
  // 실제 답변 글자가 나오기 전까지 스캔/추론 상태를 보여준다. 추론 모델은 생각하는 동안
  // 스트림이 이미 시작(streaming)돼 있어도 글자가 없으므로 status만으로는 빈 화면이 된다.
  const lastMsg = messages[messages.length - 1]
  const answerStarted =
    lastMsg?.role === "assistant" && lastMsg.parts.some((p) => p.type === "text" && p.text.trim().length > 0)
  const scanning = busy && !answerStarted

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy, open])


  // 본문에서 텍스트를 선택하고 "AI에게 질문하기"를 누르면 WikiDocContext에
  // pendingAsk가 채워진다 — 패널을 열고 즉시 질문을 보낸 뒤 비워준다.
  useEffect(() => {
    if (!pendingAsk) return
    setOpen(true)
    sendMessage(
      { text: `다음 내용에 대해 설명해줘:\n\n> ${pendingAsk}` },
      { body: { docContext: doc, recentDocs: getSessionStore().getRecentDocs(sessionId, 5) } }
    )
    clearPendingAsk()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk])

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput("")
    sendMessage({ text }, { body: { docContext: doc, recentDocs: getSessionStore().getRecentDocs(sessionId, 5) } })
  }

  return (
    <>
      {/* 우하단 둥근 퀵메뉴 버튼은 2026-10-24 요청으로 제거했다. 질문은 사이드바의 '질문하기'(/chat)에서 하고,
          이 패널은 본문에서 글을 선택해 "AI에게 질문하기"를 눌렀을 때만 열린다(닫기는 패널 안의 닫기 버튼). */}

      {/* 우측 고정 패널 */}
      <aside
        className={`fixed top-0 right-0 z-40 h-full w-full sm:w-[380px] bg-panel border-l border-line shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-4 py-2.5 bg-ink text-white shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-display font-semibold text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-500 shadow-[0_0_6px_var(--color-signal-500)]" />
              DroneWiki AI
            </span>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-sm">
              닫기
            </button>
          </div>
          <div className="text-[10px] font-hud tracking-[0.1em] text-white/50 mt-1 uppercase">
            GraphRAG · 지식그래프 근거 기반
          </div>
        </div>

        {doc && (
          <div className="px-3 py-2 text-xs font-hud bg-signal-500/10 border-b border-line text-signal-600 truncate">
            📄 이 문서를 보며 대화 중: <strong>{doc.title}</strong>
          </div>
        )}

        <ConsentGate feature="chat" compact>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="py-6 text-center text-ink-dim">
              <p className="mb-4 text-xs">
                {doc ? (
                  <>
                    「<strong className="text-ink">{doc.title}</strong>」에 대해 무엇이든 물어보세요
                  </>
                ) : (
                  "드론에 대해 무엇이든 질문하세요"
                )}
              </p>
              <div className="flex flex-col gap-1.5 px-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="text-xs px-3 py-1.5 rounded-full border border-line hover:border-signal-500 hover:text-signal-600 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const meta = m.metadata as ChatMetadata | undefined
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[90%] space-y-1.5">
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-ink text-white rounded-br-sm"
                        : "bg-paper border border-line rounded-bl-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <MarkdownText text={m.parts.map((part) => (part.type === "text" ? part.text : "")).join("")} />
                    ) : (
                      m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))
                    )}
                  </div>

                  {m.role === "assistant" && meta?.newsSources && meta.newsSources.length > 0 && (
                    <div className="px-1">
                      <p className="text-[11px] font-hud text-ink-dim mb-1">📰 참고 뉴스</p>
                      <div className="flex flex-col gap-0.5">
                        {meta.newsSources.map((n) => (
                          <a
                            key={n.url}
                            href={n.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-ink-dim hover:text-signal-600 hover:underline truncate"
                          >
                            · {n.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.role === "assistant" && meta?.answerMeta && (
                    <details className="px-1" open={meta.answerMeta.status !== "answered"}>
                      <summary className="text-[11px] font-hud text-ink-dim mb-1 cursor-pointer select-none hover:text-signal-600">
                        🧭 {meta.answerMeta.basis === "wiki-sourced" ? "위키 요약 기반(온톨로지 미연결)" : meta.answerMeta.basis === "ontology-linked" ? "온톨로지 클래스 연결 문서 기반" : "온톨로지 근거"} · {meta.answerMeta.status === "answered" ? "검증됨" : meta.answerMeta.status === "unverified" ? "⚠ 검증 경고" : "근거 부족"} · 신뢰도 {meta.answerMeta.confidence}
                        {meta.answerMeta.contested ? " · 충돌 claim 있음" : ""}
                        {meta.answerMeta.domain.length ? ` · domain ${meta.answerMeta.domain.join(", ")}` : ""}
                      </summary>
                      <div className="flex flex-col gap-1 mt-1 text-[11px] text-ink-dim">
                        {meta.answerMeta.verification.violations.length > 0 && (
                          <p className="text-amber-600">⚠ 답변에 근거 밖 내용이 있을 수 있습니다: {meta.answerMeta.verification.violations.map((v) => `${v.code}(${v.detail})`).join(", ")}</p>
                        )}
                        {meta.answerMeta.ontology.relations.map((r) => (
                          <p key={r.id}>🔗 {r.subject} —{r.predicate}→ {r.object} <span className="text-[10px]">({r.status}/{r.confidence})</span></p>
                        ))}
                        {meta.answerMeta.claims.map((c) => (
                          <p key={c.id}>
                            · [{c.status}/{c.confidence}{c.contested ? "/충돌" : ""}]{c.evidence_kind !== "reported" ? ` ⚠${c.evidence_kind}` : ""} {c.subject}: {c.value}
                          </p>
                        ))}
                        {meta.answerMeta.evidence.slice(0, 8).map((e, i) => (
                          <p key={e.claim_id + i} className="ml-2">
                            “{e.quote.slice(0, 160)}” — {e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline">{e.source_url}</a> : e.source_path} {e.locator} {e.verified ? "✓원문 일치" : "(요약 기반)"}
                          </p>
                        ))}
                        {meta.answerMeta.limitations.length > 0 && <p className="text-slate-500">한계: {meta.answerMeta.limitations.join(" / ")}</p>}
                        {meta.answerMeta.suggestions && meta.answerMeta.suggestions.length > 0 && <p>이런 질문은 답할 수 있어요: {meta.answerMeta.suggestions.join(" / ")}</p>}
                      </div>
                    </details>
                  )}

                  {m.role === "assistant" && meta?.kgFacts && (
                    <details className="px-1" open={meta.kgFacts.length > 0 && meta.kgFacts.length <= 6}>
                      <summary className="text-[11px] font-hud text-ink-dim mb-1 cursor-pointer select-none hover:text-signal-600">
                        🕸 지식그래프 근거 {meta.kgFacts.length ? `(${meta.kgFacts.length})` : "— 연결된 지식 없음"}
                      </summary>
                      <div className="flex flex-col gap-0.5 mt-1">
                        {meta.kgFacts.map((f) => (
                          <p key={f.id + f.text.slice(0, 20)} className="text-[11px] text-ink-dim">
                            <code className="text-[10px]">KG:{f.id}</code> {f.text}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}

                  {m.role === "assistant" && meta?.evidence && meta.evidence.length > 0 && (
                    <details className="px-1">
                      <summary className="text-[11px] font-hud text-ink-dim mb-1 cursor-pointer select-none hover:text-signal-600">
                        📐 설계 근거 · 공학 규칙 {meta.evidence.length}개 (논문 인용 {meta.evidence.reduce((n, r) => n + r.claims.length, 0)}건)
                      </summary>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {meta.evidence.map((r) => (
                          <div key={r.id} className="text-[11px] text-ink-dim border-l-2 border-dashed pl-2">
                            <p>
                              <b>{r.id}</b> {r.name} <code>{r.formula}</code> · 근거 상태: <b>{r.sourceStatus}</b>
                            </p>
                            {r.claims.map((c) => (
                              <p key={c.id} className="ml-2">
                                · {c.subject}: {c.value} ({c.source}, {c.locator}, {c.status}){c.quote ? ` — “${c.quote}”` : ""}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {m.role === "assistant" && meta?.sources && meta.sources.length > 0 && (
                    <details className="px-1">
                      <summary className="text-[11px] font-hud text-ink-dim mb-1 cursor-pointer select-none hover:text-signal-600">
                        🔗 출처 ({meta.sources.length})
                      </summary>
                      <div className="flex flex-wrap gap-1 mt-1">
                      {meta.sources.map((s) => {
                        const domainMeta = DOMAIN_META[s.domain as keyof typeof DOMAIN_META]
                        // raw(원문·미검증)는 /wiki/[slug] 페이지가 없다 — canonical
                        // 4계층(concepts/entities/comparisons/queries)만 위키 페이지로
                        // 발행된다. raw는 대신 원본 출처(source/source_url, 있으면)로
                        // 링크하고, 없으면 링크 없는 라벨로만 표시한다.
                        if (s.origin === "raw") {
                          const label = (
                            <>
                              <span>📎</span>
                              <span>{s.title}</span>
                            </>
                          )
                          return s.sourceUrl ? (
                            <a
                              key={s.slug}
                              href={s.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-hud border border-dashed no-underline text-ink-dim"
                            >
                              {label}
                            </a>
                          ) : (
                            <span
                              key={s.slug}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-hud border border-dashed text-ink-dim"
                            >
                              {label}
                            </span>
                          )
                        }
                        // NotebookLM 벤치마킹(2026-08-09): 인용 클릭 시 문서 맨 위가
                        // 아니라 근거 문단으로 점프시킨다. 브라우저 네이티브 Text
                        // Fragment는 완전한 문서 내비게이션에서만 안정적으로
                        // 동작하므로(SPA pushState론 불안정) 일부러 next/link가
                        // 아닌 일반 <a>를 쓴다.
                        const href = s.excerpt
                          ? buildTextFragmentUrl(`/wiki/${s.slug}`, s.excerpt)
                          : `/wiki/${s.slug}`
                        return (
                          <a
                            key={s.slug}
                            href={href}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-hud border no-underline"
                            style={{ borderColor: domainMeta?.color ?? "#94a3b8", color: domainMeta?.color ?? "#94a3b8" }}
                          >
                            <span>{domainMeta?.emoji ?? "📄"}</span>
                            <span>{s.title}</span>
                          </a>
                        )
                      })}
                      </div>
                    </details>
                  )}
                </div>
              </motion.div>
            )
          })}

          {scanning && (
            <div className="flex justify-start">
              <div className="bg-paper border border-line rounded-2xl rounded-bl-sm px-3 py-2.5 min-w-[240px]">
                <WaitingIndicator active compact />
              </div>
            </div>
          )}

          {busy && answerStarted && (
            <div className="flex justify-start pl-1 text-[11px] font-hud text-ink-dim">
              답변 작성 중<TypingDots />
            </div>
          )}

          {error && (
            <div className="text-xs font-hud text-signal-600 bg-signal-500/10 border border-signal-500/30 rounded-lg px-3 py-2">
              ⚠️ {error.message || "오류가 발생했습니다. 잠시 후 다시 시도해주세요."}
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="p-3 border-t border-line shrink-0">
          <div className="flex items-center gap-1.5 bg-paper border border-line rounded-full pl-4 pr-1.5 py-1.5 focus-within:border-signal-500/60 transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="드론에 대해 질문하세요..."
              className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!input.trim() || busy}
              aria-label="전송"
              className="w-8 h-8 shrink-0 rounded-full bg-signal-500 hover:bg-signal-600 disabled:opacity-30 text-white flex items-center justify-center transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <p className="mt-2 rounded-md bg-ink-dim/10 px-2.5 py-1.5 text-[11px] leading-snug text-ink-dim">
            무료버전이라 응답시간은 느리지만 최대 8초이상 걸릴수 있어요
          </p>
        </div>
        </ConsentGate>
      </aside>
    </>
  )
}
