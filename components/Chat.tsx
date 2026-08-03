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
  const { doc } = useWikiDoc()
  const endRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy, open])

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
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg flex items-center justify-center text-2xl transition-transform hover:scale-105"
      >
        {open ? "✕" : "🛸"}
      </button>

      {/* 우측 고정 패널 */}
      <aside
        className={`fixed top-0 right-0 z-40 h-full w-full sm:w-[380px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-4 h-11 flex items-center justify-between bg-cyan-700 text-white shrink-0">
          <span className="font-semibold text-sm">🛸 DroneWiki AI</span>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-sm">
            닫기
          </button>
        </div>

        {doc && (
          <div className="px-3 py-2 text-xs bg-cyan-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-cyan-800 dark:text-cyan-300 truncate">
            📄 이 문서를 보며 대화 중: <strong>{doc.title}</strong>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="py-6 text-center text-slate-400">
              <p className="mb-4 text-xs">드론에 대해 무엇이든 질문하세요</p>
              <div className="flex flex-col gap-1.5 px-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:border-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
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
                        ? "bg-cyan-600 text-white rounded-br-sm"
                        : "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-sm"
                    }`}
                  >
                    {m.parts.map((part, i) =>
                      part.type === "text" ? <span key={i}>{part.text}</span> : null
                    )}
                  </div>

                  {m.role === "assistant" && meta?.newsSources && meta.newsSources.length > 0 && (
                    <div className="px-1">
                      <p className="text-[11px] text-slate-400 mb-1">📰 참고 뉴스</p>
                      <div className="flex flex-col gap-0.5">
                        {meta.newsSources.map((n) => (
                          <a
                            key={n.url}
                            href={n.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-slate-500 hover:text-cyan-700 hover:underline truncate"
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
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border no-underline"
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
              <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-3 py-2">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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

        <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex gap-2 shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="드론에 대해 질문하세요..."
            className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <button
            onClick={send}
            disabled={!input.trim() || busy}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            전송
          </button>
        </div>
      </aside>
    </>
  )
}
