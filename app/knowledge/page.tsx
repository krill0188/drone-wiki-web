import Link from "next/link"
import type { Metadata } from "next"
import { KIND_LABEL, NODE_HIDE_KEYS, REL_LABEL, TYPE_LABEL, getNode, groupedNeighbors, search, stats, type BNode } from "@/lib/kg-browse"

export const metadata: Metadata = {
  title: "지식그래프 탐색 — DroneWiki",
  description: "제조사·제품·공학 규칙·원문 대조 claim·논문이 연결된 드론 지식그래프를 따라가며 확인합니다.",
}

interface Props { searchParams: Promise<{ q?: string; id?: string; all?: string }> }

const TYPE_STYLE: Record<string, string> = {
  Manufacturer: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  Product: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Rule: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  Claim: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Paper: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  Class: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
}
const badge = (type: string) => (
  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${TYPE_STYLE[type] ?? TYPE_STYLE.Class}`}>{TYPE_LABEL[type] ?? type}</span>
)
const href = (id: string) => `/knowledge?id=${encodeURIComponent(id)}`
const KIND_WARN = new Set(["model-assumption", "simulation", "cited-secondary"])

function NodeLink({ n }: { n: BNode }) {
  const kind = typeof n.evidenceKind === "string" ? n.evidenceKind : ""
  return (
    <Link href={href(n.id)} className="hover:underline">
      {badge(n.type)} <span>{n.label.length > 110 ? n.label.slice(0, 110) + "…" : n.label}</span>
      {KIND_WARN.has(kind) && <span className="ml-1 text-[10px] text-amber-600">⚠{KIND_LABEL[kind]}</span>}
    </Link>
  )
}

function Detail({ n }: { n: BNode }) {
  const extra = Object.entries(n).filter(([k, v]) => !NODE_HIDE_KEYS.has(k) && v !== "" && v !== null && v !== undefined)
  const url = typeof n.url === "string" ? n.url : typeof n.officialUrl === "string" ? n.officialUrl : ""
  const arxiv = n.type === "Paper" && n.label.startsWith("arXiv:") ? `https://arxiv.org/abs/${n.label.slice(6)}` : ""
  const groups = groupedNeighbors(n.id)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1">{badge(n.type)} <span className="text-xs text-slate-400 font-mono">{n.id}</span></p>
        <h2 className="font-bold text-base leading-snug">{n.label}</h2>
        {(url || arxiv) && (
          <a href={arxiv || url} target="_blank" rel="noopener noreferrer" className="text-xs text-signal-600 hover:underline break-all">
            {arxiv || url} ↗
          </a>
        )}
      </div>

      {n.type === "Claim" && (
        <div className="border border-amber-300 dark:border-amber-800 rounded-lg p-3 text-xs flex flex-col gap-1.5">
          <p>
            <b>증거 종류</b>: {KIND_LABEL[String(n.evidenceKind)] ?? String(n.evidenceKind ?? "-")}
            {KIND_WARN.has(String(n.evidenceKind)) && " — 실측이 아니므로 설계 상수 보정에 직접 쓰지 않습니다"}
          </p>
          {n.attribute ? <p><b>양</b>: {String(n.attribute)}</p> : null}
          <p><b>조건</b>: {String(n.conditions || "-")}</p>
          <p><b>출처 위치</b>: {String(n.source)} · {String(n.locator || "-")}</p>
          {n.quote ? <blockquote className="border-l-2 border-amber-400 pl-2 italic text-slate-600 dark:text-slate-300">“{String(n.quote)}”<span className="not-italic text-[10px] text-slate-400"> — 원문 PDF와 코드로 대조됨</span></blockquote> : <p className="text-slate-400">원문 인용 없음(파생 계산)</p>}
        </div>
      )}

      {extra.length > 0 && n.type !== "Claim" && (
        <table className="text-xs border-collapse">
          <tbody>
            {extra.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-3 text-slate-400 whitespace-nowrap align-top">{k}</td>
                <td className="py-1 break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {groups.map((g) => {
        const cap = 25
        return (
          <section key={g.rel + g.dir}>
            <h3 className="text-xs font-semibold text-slate-500 mb-1">
              {g.dir === "out" ? "→" : "←"} {REL_LABEL[g.rel] ?? g.rel} <span className="font-normal">({g.list.length})</span>
            </h3>
            <ul className="flex flex-col gap-0.5 text-xs">
              {g.list.slice(0, cap).map((nb) => (
                <li key={nb.node.id + nb.rel}>
                  <NodeLink n={nb.node} />
                  {Object.keys(nb.attrs).length > 0 && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      {Object.entries(nb.attrs).map(([k, v]) => `${k}=${v}`).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
              {g.list.length > cap && <li className="text-slate-400">… 외 {g.list.length - cap}개 (검색으로 좁혀 보세요)</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default async function KnowledgePage({ searchParams }: Props) {
  const { q = "", id = "" } = await searchParams
  const s = stats()
  const node = id ? getNode(id) : undefined
  const results = q ? search(q) : []

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <h1 className="font-bold text-lg mb-1">지식그래프 탐색</h1>
      <p className="text-xs text-slate-500 mb-3">
        AI 답변의 사실은 모두 이 그래프에서 나옵니다. 제조사 {s.manufacturers} · 제품 {s.products} · 공학 규칙 {s.rules} · 원문 대조 claim {s.claims} · 논문 {s.papers} · 관계 {s.edges.toLocaleString()}
        {" · "}
        <Link href="/knowledge-quality" className="text-signal-600 hover:underline">지식 품질 보기</Link>
      </p>

      <form action="/knowledge" method="get" className="flex gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="예: MN5008, Hobbywing, 에너지밀도, AeroEval, Jetson" className="flex-1 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-transparent" />
        <button className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-white">검색</button>
      </form>

      {node ? (
        <div>
          <p className="text-xs mb-2"><Link href={q ? `/knowledge?q=${encodeURIComponent(q)}` : "/knowledge"} className="text-signal-600 hover:underline">← 목록으로</Link></p>
          <Detail n={node} />
        </div>
      ) : id ? (
        <p className="text-sm text-slate-500">그래프에 없는 항목입니다: {id}</p>
      ) : q ? (
        results.length ? (
          <div className="flex flex-col gap-4">
            {results.map((g) => (
              <section key={g.type}>
                <h2 className="text-xs font-semibold text-slate-500 mb-1">{TYPE_LABEL[g.type] ?? g.type} ({g.total})</h2>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {g.nodes.map((n) => <li key={n.id}><NodeLink n={n} /></li>)}
                  {g.total > g.nodes.length && <li className="text-xs text-slate-400">… 외 {g.total - g.nodes.length}개 — 검색어를 더 구체적으로</li>}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">&quot;{q}&quot;와 연결된 항목이 지식그래프에 없습니다. 아직 수집·검증되지 않은 지식입니다.</p>
        )
      ) : (
        <div className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-2">
          <p>검색어를 넣거나 아래에서 시작하세요.</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {["Hobbywing", "T-MOTOR", "Jetson", "에너지밀도", "호버", "AeroEval", "Holybro", "ESC"].map((w) => (
              <Link key={w} href={`/knowledge?q=${encodeURIComponent(w)}`} className="px-2 py-1 rounded-full border border-slate-300 dark:border-slate-700 hover:border-signal-600">{w}</Link>
            ))}
          </div>
          <p className="text-xs text-slate-400">제조사 → 제품 → 함께 쓸 수 있는 부품 → 공학 규칙 → 논문 인용문으로 클릭하며 따라갈 수 있습니다.</p>
        </div>
      )}
    </div>
  )
}
