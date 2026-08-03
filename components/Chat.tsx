"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useWikiDoc } from "@/components/WikiDocContext"
import { DOMAIN_META } from "@/lib/types"

interface ChatMetadata {
  sources?: { slug: string; title: string; domain: string }[]
  newsSources?: { title: string; url: string; type: string }[]
}

type ChatUIMessage = UIMessage<ChatMetadata>

const EXAMPLES = [
  "PX4와 ArduPilot의 차이점은?",
  "MAVLink 프로토콜이란 무엇인가요?",
  "드론 비행 컨트롤러 선택 기준",
]

// 화면 우측에 고정되는 실시간 스트리밍 AI 챗봇. 위키 문서를 보는 중이면
// WikiDocContext에서 현재 문서를 읽어 매 요청마다 함께 전송한다(문서 기반 대화).
export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const { doc, pendingAsk, clearPendingAsk } = useWikiDoc()
  const endRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy, open])

  // 본문에서 텍스트를 선택하고 "AI에게 질문하기"를 누르면 WikiDocContext에
  // pendingAsk가 채워진다 — 패널을 열고 즉시 질문을 보낸 뒤 비워준다.
  useEffect(() => {
    if (!pendingAsk) return
    setOpen(true)
    sendMessage({ text: `다음 내용에 대해 설명해줘:\n\n> ${pendingAsk}` }, { body: { docContext: doc } })
    clearPendingAsk()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk])

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput("")
    sendMessage({ text }, { body: { docContext: doc } })
  }

  return (
    <>
      {/* 토글 버튼: 항상 화면 우하단에 고정 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "AI 챗봇 닫기" : "AI 챗봇 열기"}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-ink hover:bg-ink/90 text-white shadow-lg flex items-center justify-center text-2xl transition-transform hover:scale-105 ring-2 ring-signal-500/40"
      >
        {open ? "✕" : "🛸"}
      </button>

      {/* 우측 고정 패널 */}
      <aside
        className={`fixed top-0 right-0 z-40 h-full w-full sm:w-[380px] bg-panel border-l border-line shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-4 h-12 flex items-center justify-between bg-ink text-white shrink-0">
          <span className="font-display font-semibold text-sm flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-500 shadow-[0_0_6px_var(--color-signal-500)]" />
            DroneWiki AI
          </span>
          <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-sm">
            닫기
          </button>
        </div>

        {doc && (
          <div className="px-3 py-2 text-xs font-hud bg-signal-500/10 border-b border-line text-signal-600 truncate">
            📄 이 문서를 보며 대화 중: <strong>{doc.title}</strong>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="py-6 text-center text-ink-dim">
              <p className="mb-4 text-xs">드론에 대해 무엇이든 질문하세요</p>
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
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[90%] space-y-1.5">
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-ink text-white rounded-br-sm"
                        : "bg-paper border border-line rounded-bl-sm"
                    }`}
                  >
                    {m.parts.map((part, i) =>
                      part.type === "text" ? <span key={i}>{part.text}</span> : null
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

                  {m.role === "assistant" && meta?.sources && meta.sources.length > 0 && (
                    <div className="px-1 flex flex-wrap gap-1">
                      {meta.sources.map((s) => {
                        const domainMeta = DOMAIN_META[s.domain as keyof typeof DOMAIN_META]
                        return (
                          <Link
                            key={s.slug}
                            href={`/wiki/${s.slug}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-hud border no-underline"
                            style={{ borderColor: domainMeta?.color ?? "#94a3b8", color: domainMeta?.color ?? "#94a3b8" }}
                          >
                            <span>{domainMeta?.emoji ?? "📄"}</span>
                            <span>{s.title}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {busy && (
            <div className="flex justify-start">
              <div className="bg-paper border border-line rounded-2xl rounded-bl-sm px-3 py-2">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-signal-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-signal-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-signal-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs font-hud text-signal-600 bg-signal-500/10 border border-signal-500/30 rounded-lg px-3 py-2">
              ⚠️ {error.message || "오류가 발생했습니다. 잠시 후 다시 시도해주세요."}
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="p-3 border-t border-line flex gap-2 shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="드론에 대해 질문하세요..."
            className="flex-1 border border-line rounded-xl px-3 py-2 text-sm bg-panel focus:outline-none focus:ring-2 focus:ring-signal-500/40"
          />
          <button
            onClick={send}
            disabled={!input.trim() || busy}
            className="px-4 py-2 bg-signal-500 hover:bg-signal-600 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            전송
          </button>
        </div>
      </aside>
    </>
  )
}
