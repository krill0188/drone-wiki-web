"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { DocContext } from "@/lib/types"

interface WikiDocContextValue {
  doc: DocContext | null
  setDoc: (doc: DocContext | null) => void
  // Liner 스타일 텍스트 선택 → "AI에게 질문하기" 연동. 본문(TextSelectionPopup)이
  // 선택한 텍스트를 여기 밀어넣으면, 전역에 떠 있는 Chat.tsx가 감지해서 패널을 열고
  // 자동으로 질문을 보낸다 — 두 컴포넌트가 서로 직접 참조하지 않고 컨텍스트로만 연결.
  pendingAsk: string | null
  askAboutSelection: (text: string) => void
  clearPendingAsk: () => void
}

const WikiDocCtx = createContext<WikiDocContextValue | null>(null)

export function WikiDocProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<DocContext | null>(null)
  const [pendingAsk, setPendingAsk] = useState<string | null>(null)

  const askAboutSelection = useCallback((text: string) => setPendingAsk(text), [])
  const clearPendingAsk = useCallback(() => setPendingAsk(null), [])

  const value = useMemo(
    () => ({ doc, setDoc, pendingAsk, askAboutSelection, clearPendingAsk }),
    [doc, pendingAsk, askAboutSelection, clearPendingAsk]
  )
  return <WikiDocCtx.Provider value={value}>{children}</WikiDocCtx.Provider>
}

export function useWikiDoc(): WikiDocContextValue {
  const ctx = useContext(WikiDocCtx)
  if (!ctx) throw new Error("useWikiDoc must be used within a WikiDocProvider")
  return ctx
}

// 위키 상세 페이지(서버 컴포넌트)에서 렌더링해 현재 문서를 전역 컨텍스트에 등록한다.
// 페이지를 벗어나면(언마운트) 컨텍스트를 비워 다른 화면에서 잘못된 문서가 딸려가지 않게 한다.
export function WikiDocSync({ slug, title, content }: DocContext) {
  const { setDoc } = useWikiDoc()

  useEffect(() => {
    setDoc({ slug, title, content })
    return () => setDoc(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, title, content])

  return null
}
