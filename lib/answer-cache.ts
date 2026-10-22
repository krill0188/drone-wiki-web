// 반복 질문 캐시(프로세스 메모리). 같은 배포(= 같은 위키·DB) 안에서만 유효하므로 새 배포가 곧 무효화다.
// 단일 턴·문서 맥락 없는 질문의 '검증 통과 답변'만 저장한다(검증 경고·근거 부족 답변은 저장하지 않는다).
type Entry = { text: string; meta: Record<string, unknown>; at: number }
const TTL_MS = 6 * 3600_000
const MAX = 200
const store = new Map<string, Entry>()

export const cacheKey = (question: string) => question.normalize("NFKC").toLowerCase().replace(/[\s?？!.。]+/g, " ").trim()

export function cacheGet(key: string): Entry | null {
  const e = store.get(key)
  if (!e) return null
  if (Date.now() - e.at > TTL_MS) { store.delete(key); return null }
  return e
}

export function cachePut(key: string, text: string, meta: Record<string, unknown>) {
  if (!key || !text) return
  if (store.size >= MAX) store.delete(store.keys().next().value as string)
  store.set(key, { text, meta, at: Date.now() })
}
