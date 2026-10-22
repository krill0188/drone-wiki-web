import Link from "next/link"
import type { Metadata } from "next"
import quality from "../../data/ontology/quality.json"
import rulesJson from "../../data/ontology/rules.json"

export const metadata: Metadata = {
  title: "지식 품질 — DroneWiki",
  description: "드론 지식그래프의 근거 수준, 공백, 무결성 검사 결과를 공개합니다.",
}

type Q = {
  generated: string
  counts: Record<string, number>
  claimsByKind: Record<string, number>
  claimsByTopic: Record<string, number>
  productsByCategory: Record<string, number>
  manufacturers: { withSpecs: number; registryOnly: number; countryVerified: number; countryUnverified: number; countryUnknown: number }
  edgesByRelation: Record<string, number>
  rules: { id: string; name: string; status: string; kind: string; sourceStatus: string | null; claims: number; byKind: Record<string, number>; papers: number }[]
  audit: { desc: string; ok: boolean; count: number; sample: string[] }[]
  warnings: { desc: string; ok: boolean; count: number; sample: string[] }[]
}
const Qd = quality as unknown as Q
// 규칙별 웹 조사 강도·문헌 대조·검토 결정(rules.json). 근거가 약한 규칙도 숨기지 않고 그대로 보여 준다.
type RuleExtra = { id: string; literatureConflict?: string; reviewDecision?: { decision?: string; rationale?: string }; webEvidence?: { strength?: string; collected?: string } }
const extraById = new Map(((((rulesJson as { rules?: RuleExtra[] }).rules ?? (rulesJson as unknown as RuleExtra[]))) as RuleExtra[]).map((r) => [r.id, r]))
const STRENGTH_COLOR: Record<string, string> = { HIGH: "text-emerald-700 dark:text-emerald-300", MEDIUM: "text-amber-700 dark:text-amber-300", LOW: "text-red-700 dark:text-red-300" }

const KIND_LABEL: Record<string, string> = { reported: "논문 보고값", "model-assumption": "모델 가정값", simulation: "시뮬레이션", "cited-secondary": "2차 인용", derived: "파생 계산" }
const KIND_COLOR: Record<string, string> = { reported: "bg-emerald-500", derived: "bg-sky-500", "model-assumption": "bg-amber-500", simulation: "bg-orange-500", "cited-secondary": "bg-slate-400" }
const RULE_KIND: Record<string, string> = { empirical: "실측 상수", heuristic: "경험칙", definition: "산술 정의" }
const SRC_LABEL: Record<string, { t: string; c: string }> = {
  verified: { t: "원문 확인", c: "text-emerald-700 dark:text-emerald-300" },
  "verified-with-derived": { t: "원문+파생", c: "text-emerald-700 dark:text-emerald-300" },
  "partially-verified": { t: "부분 확인", c: "text-amber-700 dark:text-amber-300" },
  "candidate-source": { t: "후보 출처", c: "text-orange-700 dark:text-orange-300" },
  unverified: { t: "재확인 필요", c: "text-red-700 dark:text-red-300" },
  conflict: { t: "충돌", c: "text-red-700 dark:text-red-300" },
}

function Bar({ parts }: { parts: Record<string, number> }) {
  const total = Object.values(parts).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="flex h-2 w-full rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
      {Object.entries(parts).map(([k, v]) => <div key={k} className={KIND_COLOR[k] ?? "bg-slate-300"} style={{ width: `${(v / total) * 100}%` }} title={`${KIND_LABEL[k] ?? k} ${v}`} />)}
    </div>
  )
}

export default function QualityPage() {
  const q = Qd
  const failed = q.audit.filter((a) => !a.ok)
  const realClaims = (q.claimsByKind.reported ?? 0) + (q.claimsByKind.derived ?? 0)
  const m = q.manufacturers
  const registryTotal = m.countryVerified + m.countryUnverified
  return (
    <div className="max-w-3xl mx-auto px-4 py-5 text-sm">
      <h1 className="font-bold text-lg mb-1">지식 품질</h1>
      <p className="text-xs text-slate-500 mb-4">
        지식그래프가 어디까지 믿을 만한지 그대로 공개합니다. 생성 {q.generated} (SQLite 무결성 검사 결과) ·{" "}
        <Link href="/knowledge" className="text-signal-600 hover:underline">지식그래프 탐색</Link>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5 text-center">
        {[["제조사", q.counts.manufacturers], ["제품", q.counts.products], ["공학 규칙", q.counts.rules], ["원문 대조 claim", q.counts.claims], ["논문", q.counts.papers], ["관계", q.counts.edges]].map(([l, v]) => (
          <div key={String(l)} className="border border-slate-200 dark:border-slate-700 rounded-lg py-2">
            <div className="text-lg font-bold">{Number(v).toLocaleString()}</div>
            <div className="text-[11px] text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      <section className="mb-6">
        <h2 className="font-semibold mb-1">무결성 검사 {failed.length === 0 ? "✅ 모두 통과" : `❌ ${failed.length}건 실패`}</h2>
        <ul className="text-xs flex flex-col gap-0.5">
          {q.audit.map((a) => (
            <li key={a.desc}>
              {a.ok ? "✅" : "❌"} {a.desc}
              {!a.ok && <span className="text-red-600"> — {a.count}건: {a.sample.join(", ")}</span>}
            </li>
          ))}
        </ul>
        <h3 className="font-semibold mt-3 mb-1 text-xs text-slate-500">보완 대상(실패는 아님)</h3>
        <ul className="text-xs flex flex-col gap-0.5">
          {q.warnings.map((w) => (
            <li key={w.desc}>
              {w.ok ? "✅" : "⚠"} {w.desc}
              {!w.ok && <span className="text-amber-700 dark:text-amber-300"> — {w.count}건 {w.sample.length ? `(예: ${w.sample.slice(0, 4).join(", ")})` : ""}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-1">claim 증거 종류</h2>
        <p className="text-xs text-slate-500 mb-1">
          논문 보고값·파생 {realClaims}건 / 모델 가정·시뮬레이션·2차 인용 {q.counts.claims - realClaims}건. 후자는 실측이 아니라서 설계 상수 보정에 직접 쓰지 않고 답변에 ⚠ 태그를 붙입니다.
        </p>
        <Bar parts={q.claimsByKind} />
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-1">
          {Object.entries(q.claimsByKind).map(([k, v]) => <span key={k}><i className={`inline-block w-2 h-2 rounded-sm mr-1 ${KIND_COLOR[k] ?? "bg-slate-300"}`} />{KIND_LABEL[k] ?? k} {v}</span>)}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-1">공학 규칙별 근거</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="py-1 pr-2">규칙</th><th className="pr-2">종류</th><th className="pr-2">근거 상태</th><th className="pr-2">claim</th><th className="pr-2">논문</th><th className="pr-2">웹 조사</th><th className="w-28">증거 구성</th>
              </tr>
            </thead>
            <tbody>
              {q.rules.filter((r) => r.status === "implemented").map((r) => {
                const s = SRC_LABEL[r.sourceStatus ?? "unverified"] ?? SRC_LABEL.unverified
                const gap = r.kind === "empirical" && r.claims === 0
                return (
                  <tr key={r.id} className={`border-b border-slate-100 dark:border-slate-800 ${gap ? "bg-red-50 dark:bg-red-950/30" : ""}`}>
                    <td className="py-1 pr-2"><Link href={`/knowledge?id=${encodeURIComponent("rule:" + r.id)}`} className="hover:underline"><b>{r.id}</b> {r.name}</Link></td>
                    <td className="pr-2 whitespace-nowrap">{RULE_KIND[r.kind] ?? r.kind}</td>
                    <td className={`pr-2 whitespace-nowrap ${s.c}`}>{s.t}</td>
                    <td className="pr-2">{r.claims}{gap && " ❗공백"}</td>
                    <td className="pr-2">{r.papers}</td>
                    <td className="pr-2 whitespace-nowrap">
                      {extraById.get(r.id)?.webEvidence?.strength ? <span className={STRENGTH_COLOR[extraById.get(r.id)!.webEvidence!.strength!] ?? ""} title={extraById.get(r.id)?.literatureConflict?.replace(/\*\*/g, "") ?? ""}>{extraById.get(r.id)!.webEvidence!.strength}</span> : <span className="text-slate-300">—</span>}
                      {extraById.get(r.id)?.reviewDecision?.decision === "keep" && <span className="text-slate-500" title={extraById.get(r.id)?.reviewDecision?.rationale}> · 유지</span>}
                    </td>
                    <td>{r.claims ? <Bar parts={r.byKind} /> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">웹 조사 열은 규칙 상수를 문헌·제조사 자료와 대조한 강도(HIGH 직접 일치 / MEDIUM 부분 / LOW 간접)이며, 마우스를 올리면 대조 결과와 유지 사유가 보입니다. 실측 상수 규칙에 근거 claim이 없으면 공백(❗)으로 표시됩니다. 산술 정의는 근거가 필요 없고, 경험칙은 보조 근거만 있으면 됩니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-1">제조사·제품</h2>
        <ul className="text-xs flex flex-col gap-0.5">
          <li>제품 사양까지 수집된 제조사 {m.withSpecs}곳 / 제조사 레지스트리에만 있는 곳 {m.registryOnly}곳</li>
          <li>국가·본사 정보: 공식 페이지 확인 {m.countryVerified}곳 · 일반지식 표기(재확인 필요) {m.countryUnverified}곳 · 정보 없음 {m.countryUnknown}곳 {registryTotal ? `(확인율 ${Math.round((m.countryVerified / registryTotal) * 100)}%)` : ""}</li>
          <li>분류별 제품: {Object.entries(q.productsByCategory).map(([k, v]) => `${k} ${v}`).join(" · ")}</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-1">관계 종류</h2>
        <p className="text-xs text-slate-600 dark:text-slate-300">{Object.entries(q.edgesByRelation).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · ")}</p>
        <p className="text-[11px] text-slate-400 mt-1">packFits는 셀 수만 비교한 느슨한 호환이라 확정 호환이 아닙니다. powersWith는 ESC 연속 전류 ≥ 모터 최대 전류와 셀 범위 겹침을 모두 만족한 관계입니다.</p>
      </section>
    </div>
  )
}
