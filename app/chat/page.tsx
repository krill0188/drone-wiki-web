"use client"

import { useState, useRef, useEffect } from "react"

interface Message {
  role: "user" | "assistant"
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: q }])
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer || "응답을 가져올 수 없습니다." }])
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." }])
    } finally {
      setLoading(false)
    }
  }

  const EXAMPLES = [
    "PX4와 ArduPilot의 차이점은?",
    "MAVLink 프로토콜이란 무엇인가요?",
    "드론 비행 컨트롤러 선택 기준",
    "한국 드론 비행 허가 절차",
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      <h1 className="text-2xl font-bold mb-1">AI Q&amp;A</h1>
      <p className="text-sm text-slate-500 mb-6">드론 위키 지식 기반으로 즉시 답변합니다</p>

      {/* 대화창 */}
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
                  className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 hover:border-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-cyan-600 text-white rounded-br-sm"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 입력창 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="드론에 대해 질문하세요..."
          className="flex-1 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          전송
        </button>
      </div>
    </div>
  )
}
