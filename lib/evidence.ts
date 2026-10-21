import rulesJson from "../data/ontology/rules.json"
import claimsJson from "../data/ontology/claims.json"

export interface EvidenceClaim { id: string; subject: string; value: string; source: string; locator: string; quote: string; status: string; kind?: string }
export interface EvidenceRule { id: string; name: string; formula: string; sourceStatus: string; claims: EvidenceClaim[]; review?: string; conflict?: string; webStrength?: string }

type RuleRow = { id: string; name: string; formula?: string; status: string; sourceStatus?: string; claims?: string[]; literatureConflict?: string; reviewDecision?: { decision?: string; rationale?: string }; webEvidence?: { strength?: string } }
type ClaimRow = { evidenceKind?: string; id: string; subject: string; value: unknown; sourceId: string; locator: string; quote: string; status: string }

const rules = ((rulesJson as { rules?: RuleRow[] }).rules ?? (rulesJson as unknown as RuleRow[])) as RuleRow[]
const claims = new Map(((claimsJson as { claims: ClaimRow[] }).claims).map((c) => [c.id, c]))

// 설계 판정에 실제로 쓰인 규칙(구현된 것)과 그 근거 claim을 화면에 공개하기 위한 목록.
// 근거가 약한 규칙(unverified 등)도 상태를 그대로 보여준다 — 숨기지 않는다.
export function designEvidence(): EvidenceRule[] {
  return rules
    .filter((r) => r.status === "implemented")
    .map((r) => ({
      id: r.id,
      name: r.name,
      formula: r.formula ?? "",
      sourceStatus: r.sourceStatus ?? "unverified",
      review: r.reviewDecision?.rationale,
      conflict: r.literatureConflict,
      webStrength: r.webEvidence?.strength,
      claims: (r.claims ?? [])
        .map((id) => claims.get(id))
        .filter((c): c is ClaimRow => !!c)
        .map((c) => ({ id: c.id, subject: c.subject, value: String(c.value), source: c.sourceId, locator: c.locator, quote: c.quote, status: c.status, kind: c.evidenceKind })),
    }))
}
