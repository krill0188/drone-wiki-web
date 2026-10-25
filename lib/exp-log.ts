// 경험 로그(2026-10-25): 질문·설계 사례를 90일 보관용으로 저장한다(동의한 사용자만). 저장 실패는 응답을 막지 않는다.
// 저장하는 것: 마스킹한 질문, 응답 상태·근거 종류·근거 문서 slug·지연. 답변 전문은 저장하지 않는다.
import { after } from "next/server"
import type { NextRequest } from "next/server"
import { consentMode, hasConsent, isTestTraffic, CONSENT_VERSION } from "./consent"
import { maskText } from "./mask"
import { verifyUser, isOwnerEmail } from "./auth-verify"

export type Feature = "chat" | "drone-builder"
export interface TurnRow {
  session_id: string
  user_id: string | null
  feature: Feature
  stage: string | null
  question: string
  status: string
  basis: string | null
  classes: string[]
  doc_slugs: string[]
  model_tier: string | null
  latency_ms: number | null
  is_test: boolean
  consent_version: string
}
export interface ExpBackend { insert(table: string, row: Record<string, unknown>, opts?: { upsertOn?: string }): Promise<void> }

const noneBackend: ExpBackend = { async insert() { /* 저장소 미연결: 버린다 */ } }

function supabaseBackend(url: string, key: string): ExpBackend {
  return {
    async insert(table, row, opts) {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 4000)
      try {
        const q = opts?.upsertOn ? `?on_conflict=${encodeURIComponent(opts.upsertOn)}` : ""
        await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}${q}`, {
          method: "POST",
          // 새 publishable 키(sb_publishable_…)는 apikey 헤더만 쓰고, 옛 JWT 키(eyJ…)는 Authorization도 함께 보낸다.
          headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", Prefer: opts?.upsertOn ? "resolution=ignore-duplicates,return=minimal" : "return=minimal" },
          body: JSON.stringify(row),
          signal: ac.signal,
        })
      } finally { clearTimeout(t) }
    },
  }
}

export function getBackend(env: Record<string, string | undefined> = process.env): ExpBackend {
  // 서버가 가진 키는 '넣기 전용' publishable 키다(읽기·수정·삭제 권한 없음). 읽기는 관리자만 한다.
  if ((env.EXP_LOG_BACKEND ?? "") === "supabase" && env.EXP_SUPABASE_URL && env.EXP_SUPABASE_KEY) return supabaseBackend(env.EXP_SUPABASE_URL, env.EXP_SUPABASE_KEY)
  return noneBackend
}

// 세션당 시간당 기록 상한(서버리스 인스턴스 단위의 최선 방어 — 스팸·오염 억제)
const HOUR = 3600_000, CAP = 120
const hits = new Map<string, number[]>()
function allowed(sid: string, now = Date.now()): boolean {
  const arr = (hits.get(sid) ?? []).filter((t) => now - t < HOUR)
  if (arr.length >= CAP) { hits.set(sid, arr); return false }
  arr.push(now); hits.set(sid, arr)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR)) hits.delete(k)
  return true
}

export function buildTurnRow(p: { sid: string; userId?: string | null; feature: Feature; stage?: string | null; question: string; status?: string; basis?: string | null; classes?: string[]; docSlugs?: string[]; tier?: string | null; latencyMs?: number | null; isTest: boolean }): TurnRow {
  return {
    session_id: p.sid, user_id: p.userId ?? null, feature: p.feature, stage: p.stage ?? null, question: maskText(p.question, 1500), status: p.status ?? "answered", basis: p.basis ?? null,
    classes: (p.classes ?? []).slice(0, 8), doc_slugs: (p.docSlugs ?? []).slice(0, 12), model_tier: p.tier ?? null, latency_ms: p.latencyMs ?? null, is_test: p.isTest, consent_version: CONSENT_VERSION,
  }
}

export interface Track { set(p: { status?: string; basis?: string | null; classes?: string[]; docSlugs?: string[]; tier?: string | null }): void }

// 요청 시작에서 호출한다. 응답이 끝난 뒤(after) 한 번 저장하므로 분기마다 set()으로 상태만 채우면 된다.
export function startTrack(req: NextRequest, feature: Feature, question: string, stage?: string): Track {
  const mode = consentMode()
  const state: { status?: string; basis?: string | null; classes?: string[]; docSlugs?: string[]; tier?: string | null } = {}
  const t0 = Date.now()
  const track: Track = { set(p) { Object.assign(state, p) } }
  try {
    if (mode === "off" || !question.trim() || !hasConsent(req.cookies)) return track
    const sid = req.cookies.get("dw_sid")?.value ?? ""
    if (!sid || !allowed(sid)) return track
    const isTest0 = isTestTraffic(req)
    const userP = verifyUser(req) // 로그인 사용자 확인은 응답과 병렬로 시작한다
    after(async () => {
      try {
        const user = await userP
        const row = buildTurnRow({ sid, userId: user?.id ?? null, feature, stage, question, ...state, latencyMs: Date.now() - t0, isTest: isTest0 || isOwnerEmail(user?.email) })
        await getBackend().insert("exp_turns", row as unknown as Record<string, unknown>)
      } catch { /* 기록 실패는 응답에 영향을 주지 않는다 */ }
    })
  } catch { /* after() 사용 불가 환경(시험 등)에서는 기록하지 않는다 */ }
  return track
}
