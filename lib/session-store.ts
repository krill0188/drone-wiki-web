import type { Domain } from "./types"

// 클라우드 전환을 염두에 둔 세션 저장소 인터페이스(2026-08-08, 마스터 요청).
// 지금은 LocalSessionStore(브라우저 localStorage) 하나만 구현돼 있지만, 나중에
// 계정/DB가 생기면 이 인터페이스를 그대로 구현하는 SupabaseSessionStore 등으로
// 교체하면 된다 — 호출부는 getSessionStore()만 불러 쓰므로 UI 컴포넌트 수정이
// 필요 없다(교체 지점은 이 파일 getSessionStore() 함수 하나뿐).
//
// 익명 식별자는 localStorage가 아니라 쿠키(dw_sid, middleware.ts에서 발급)로
// 관리한다 — 쿠키는 서버(API 라우트)로도 전송되므로, 나중에 로그인을 붙이면 이
// 익명 ID를 그대로 실계정 user_id에 매핑해 이관할 수 있다. localStorage만 썼다면
// 이 마이그레이션 고리가 아예 없어진다.

export interface DocViewRecord {
  slug: string
  title: string
  domain: Domain
  viewedAt: string
}

export interface SessionStore {
  recordDocView(sessionId: string, doc: Omit<DocViewRecord, "viewedAt">): void
  getRecentDocs(sessionId: string, limit?: number): DocViewRecord[]
  saveSnapshot<T>(sessionId: string, feature: string, data: T): void
  loadSnapshot<T>(sessionId: string, feature: string): T | null
  clearSnapshot(sessionId: string, feature: string): void
}

const MAX_VIEWS = 30
const viewsKey = (sid: string) => `dronewiki:${sid}:views`
const snapshotKey = (sid: string, feature: string) => `dronewiki:${sid}:snapshot:${feature}`

class LocalSessionStore implements SessionStore {
  private read<T>(key: string): T | null {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }

  private write(key: string, value: unknown) {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 저장 공간 초과 등은 조용히 무시한다 — 편의 기능이 실패해도 핵심 기능(챗봇
      // 자체)은 계속 동작해야 한다.
    }
  }

  recordDocView(sessionId: string, doc: Omit<DocViewRecord, "viewedAt">) {
    if (!sessionId) return
    const key = viewsKey(sessionId)
    const existing = this.read<DocViewRecord[]>(key) || []
    const next = [
      { ...doc, viewedAt: new Date().toISOString() },
      ...existing.filter((v) => v.slug !== doc.slug),
    ].slice(0, MAX_VIEWS)
    this.write(key, next)
  }

  getRecentDocs(sessionId: string, limit = 5): DocViewRecord[] {
    if (!sessionId) return []
    return (this.read<DocViewRecord[]>(viewsKey(sessionId)) || []).slice(0, limit)
  }

  saveSnapshot<T>(sessionId: string, feature: string, data: T) {
    if (!sessionId) return
    this.write(snapshotKey(sessionId, feature), data)
  }

  loadSnapshot<T>(sessionId: string, feature: string): T | null {
    if (!sessionId) return null
    return this.read<T>(snapshotKey(sessionId, feature))
  }

  clearSnapshot(sessionId: string, feature: string) {
    if (!sessionId || typeof window === "undefined") return
    window.localStorage.removeItem(snapshotKey(sessionId, feature))
  }
}

let instance: SessionStore | null = null

/** 클라우드 전환 시 이 함수 안의 구현체만 교체한다. */
export function getSessionStore(): SessionStore {
  if (!instance) instance = new LocalSessionStore()
  return instance
}
