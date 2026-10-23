import { kdbInfo } from "@/lib/kdb"

// 운영 점검용 상태 확인(읽기 전용, 비밀값 없음). 배포 직후와 정기 점검(scripts/ops-eval.sh)이 호출한다.
// ok=false(지식 DB 적재 실패)면 503을 돌려 모니터가 바로 잡을 수 있게 한다.
export const dynamic = "force-dynamic"

export async function GET() {
  const info = kdbInfo()
  const flags = {
    kgBackend: process.env.KG_BACKEND ?? "json",
    kgTier: process.env.KG_TIER ?? "off",
    builderTier: process.env.BUILDER_TIER ?? "off",
    nimConfigured: Boolean(process.env.NVIDIA_NIM_API_KEY), // 키 값은 노출하지 않고 설정 여부만
  }
  if (!info.ok) return Response.json({ ok: false, error: String(info.error ?? "kdb load failed"), flags }, { status: 503 })
  const c = info.counts as Record<string, string>
  return Response.json({
    ok: true,
    loadMs: info.loadMs,
    fingerprint: info.fingerprint,
    counts: { documents: Number(c.count_documents ?? 0), claims: Number(c.count_claims ?? 0), products: Number(c.count_products ?? 0), ontologyNodes: Number(c.count_ontology_nodes ?? 0) },
    flags,
    checkedAt: new Date().toISOString(),
  })
}
