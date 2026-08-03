"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { DocContext } from "@/lib/types"

interface WikiDocContextValue {
  doc: DocContext | null
  setDoc: (doc: DocContext | null) => void
}

const WikiDocCtx = createContext<WikiDocContextValue | null>(null)

export function WikiDocProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<DocContext | null>(null)
  const value = useMemo(() => ({ doc, setDoc }), [doc])
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
