"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { DOMAIN_META } from "@/lib/types"

interface ChatMetadata {
  sources?: { slug: string; title: string; domain: string; origin?: "canonical" | "raw"; sourceUrl?: string }[]
  newsSources?: { title: string; url: string; type: string }[]
}

type ChatUIMessage = UIMessage<ChatMetadata>

const EXAMPLES = [
  "PX4와 ArduPilot의 차이점은?",
  "MAVLink 프로토콜이란 무엇인가요?",
  "드론 비행 컨트롤러 선택 기준",
  "한국 드론 비행 허가 절차",
]

export default function ChatPage() {
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy])

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput("")
    sendMessage({ text })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      <h1 className="text-2xl font-bold mb-1">AI Q&amp;A</h1>
      <p className="text-sm text-slate-500 mb-6">
        드론 위키 지식 베이스를 RAG로 검색하여 실시간 스트리밍으로 답변합니다
      </p>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[300px]">
        {messages.length === 0 && (
          <div className="py-10 text-center text-slate-400">
            <div className="text-4xl mb-4">🛸</div>
            <p className="mb-6 text-sm">드론에 대해 무엇이든 질문하세요</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:border-signal-400 hover:text-signal-500 dark:hover:text-signal-400 transition-colors"
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
              <div className="max-w-[85%] space-y-2">
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-signal-500 text-white rounded-br-sm"
                      : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-sm"
                  }`}
                >
                  {m.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                </div>

                {m.role === "assistant" && meta?.newsSources && meta.newsSources.length > 0 && (
                  <div className="px-1">
                    <p className="text-xs text-slate-400 mb-1.5">📰 참고 뉴스</p>
                    <div className="flex flex-col gap-1">
                      {meta.newsSources.map((n) => (
                        <a
                          key={n.url}
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-500 hover:text-signal-600 hover:underline truncate"
                        >
                          · {n.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {m.role === "assistant" && meta?.sources && meta.sources.length > 0 && (
                  <details className="px-1">
                    <summary className="text-xs text-slate-400 mb-1.5 cursor-pointer select-none hover:text-signal-600">
                      📚 출처 ({meta.sources.length})
                    </summary>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {meta.sources.map((s) => {
                        const domainMeta = DOMAIN_META[s.domain as keyof typeof DOMAIN_META]
                        // raw(원문·미검증)는 /wiki/[slug] 페이지가 없다 — 원본 출처로
                        // 링크하거나(있으면), 없으면 링크 없이 라벨만 보여준다.
                        if (s.origin === "raw") {
                          const pillStyle = {
                            display: "inline-flex", alignItems: "center", gap: "0.25rem",
                            padding: "0.2rem 0.6rem", borderRadius: "9999px", fontSize: "0.7rem",
                            border: "1px dashed #94a3b8", color: "#64748b", textDecoration: "none",
                          } as const
                          return s.sourceUrl ? (
                            <a key={s.slug} href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={pillStyle}>
                              <span>📎</span>
                              <span>{s.title}</span>
                            </a>
                          ) : (
                            <span key={s.slug} style={pillStyle}>
                              <span>📎</span>
                              <span>{s.title}</span>
                            </span>
                          )
                        }
                        return (
                          <Link
                            key={s.slug}
                            href={`/wiki/${s.slug}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "9999px",
                              fontSize: "0.7rem",
                              border: "1px solid",
                              borderColor: domainMeta?.color ?? "#94a3b8",
                              color: domainMeta?.color ?? "#94a3b8",
                              textDecoration: "none",
                            }}
                          >
                            <span>{domainMeta?.emoji ?? "📄"}</span>
                            <span>{s.title}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )
        })}

        {busy && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                <span className="text-xs text-slate-400 ml-2">답변 생성 중...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            ⚠️ {error.message || "오류가 발생했습니다. 잠시 후 다시 시도해주세요."}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="드론에 대해 질문하세요..."
          className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-signal-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || busy}
          className="px-5 py-3 bg-signal-500 hover:bg-signal-500/100 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          전송
        </button>
      </div>
    </div>
  )
}
