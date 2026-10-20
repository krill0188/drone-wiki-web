import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

// 지식 RDB 읽기 전용 접근. 원본은 Git/Markdown이고 이 DB는 scripts/build-knowledge-db.py가 만든 텍스트 덤프(data/knowledge/knowledge.sql)를
// 서버 시작 시 :memory:에 적재한 파생물이다. 쓰기 경로는 없다.
// 적재 실패(파일 없음·SQL 오류)는 null을 돌려주고 호출부가 기존 JSON 경로로 폴백한다 — 예외로 서비스가 죽지 않는다.

let _db: DatabaseSync | null | undefined
let _loadMs = 0
let _error = ""

export function kdb(): DatabaseSync | null {
  if (_db !== undefined) return _db
  const t0 = Date.now()
  try {
    // KDB_SQL_PATH는 시험 전용(발행 전 내부 빌드로 질의 로직을 검증). 운영에서는 설정하지 않는다.
    const p = process.env.KDB_SQL_PATH || path.join(process.cwd(), "data", "knowledge", "knowledge.sql")
    const db = new DatabaseSync(":memory:")
    db.exec(fs.readFileSync(p, "utf-8"))
    _db = db
  } catch (e) {
    _error = e instanceof Error ? e.message : String(e)
    console.error("[kdb] 지식 DB 적재 실패, JSON 경로로 폴백:", _error)
    _db = null
  }
  _loadMs = Date.now() - t0
  return _db
}

export function kdbInfo() {
  const db = kdb()
  if (!db) return { ok: false as const, error: _error, loadMs: _loadMs }
  const meta = Object.fromEntries((db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]))
  return { ok: true as const, loadMs: _loadMs, fingerprint: (meta.input_fingerprint ?? "").slice(0, 12), counts: meta }
}

export type Row = Record<string, string | number | null>
export function all<T = Row>(sql: string, ...params: (string | number | null)[]): T[] {
  const db = kdb()
  if (!db) return []
  return db.prepare(sql).all(...params) as T[]
}
export function get<T = Row>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return all<T>(sql, ...params)[0]
}

// 서버 질의에서 쓰는 선택적 백엔드 스위치: KG_BACKEND=sqlite 일 때만 사용. 기본은 json(기존 경로).
export function isSqliteBackend(): boolean {
  return process.env.KG_BACKEND === "sqlite" && kdb() !== null
}
