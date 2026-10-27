// 일반 공학 설명 계층 실모델 평가(설계서 §3.6 E3·E4·E6). 실행: npx tsx scripts/eval-general-tier.ts   (NIM 호출, 순차)
// 출력: 질문별 상태·사유·지연, 통과 출력 전문(사람이 읽고 사실 오류를 판정한다 — E4).
import fs from "node:fs"
import path from "node:path"
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const m = /^NVIDIA_NIM_API_KEY=(.*)$/.exec(line)
  if (m) process.env.NVIDIA_NIM_API_KEY = m[1].replace(/^["']|["']$/g, "")
}
const Q = [
  // 정의·원리
  "브러시리스 모터 KV 값은 무슨 의미야?", "PID 튜닝이 뭐고 드론에서 왜 중요해?", "비행 컨트롤러의 역할이 뭐야?", "ESC가 하는 일이 뭐야?", "IMU는 무엇이고 왜 필요해?", "자이로 드리프트가 뭐야?",
  "짐벌은 무슨 역할을 해?", "리포 배터리의 C 레이팅은 무슨 의미야?", "프로펠러 피치가 뭐야?", "호버링이 뭐고 왜 어려워?", "텔레메트리는 무엇이야?", "RTK가 뭐야?", "기압계는 드론에서 무슨 역할을 해?",
  "컴퍼스 센서는 왜 필요해?", "페일세이프가 뭐야?", "오프보드 제어 모드는 무엇이야?", "추력과 양력의 차이는?", "수신기와 송신기의 역할 차이는?",
  // 원인
  "모터가 과열되는데 어떻게 해결해?", "드론이 이륙 후 한쪽으로 계속 쏠려요. 원인이 뭘까요?", "비행 중 영상 전송이 끊겨요", "PX4에서 EKF 에러가 뜨는 이유는?", "GPS 신호가 불안정할 때 어떻게 해야 해?",
  "짐벌이 떨리는 원인이 뭐야?", "프로펠러에서 진동이 생기는 이유는?", "드론이 호버링 중에 고도가 흔들리는 원인은?", "리포 배터리가 부풀어 오르는 이유는?", "모터에서 이상한 소리가 나는 원인은?",
  "수신기 신호가 끊기는 원인이 뭐야?", "호버링이 불안정한 이유는?", "캘리브레이션이 실패하는 원인은?", "짐벌 모터가 과열되는 이유는?", "드론이 착륙할 때 튀어오르는 원인은?", "컴퍼스 에러가 뜨는 이유는?",
  "비행 중 자세가 갑자기 흔들리는 원인은?", "배터리가 금방 닳는 이유가 뭐야?", "영상에 노이즈가 생기는 원인은?", "GPS 위성 수신이 늦어지는 이유는?", "모터 하나가 뜨겁게 달아오르는 이유는?",
  "FC가 자꾸 재부팅되는 이유는?", "드론이 한 방향으로 계속 밀려요 왜 그럴까요?", "페일세이프가 오작동하는 원인은?", "비행 중 신호가 끊기는 원인이 뭐야?", "자동 이륙이 안 되는 이유는?",
]
const QS: string[] = process.env.EVAL_Q ? JSON.parse(process.env.EVAL_Q) : Q // 질문 집합 교체(추가 표본 평가용)
async function main() {
  const { generalTier } = await import("../lib/general-tier")
  const rows: { q: string; status: string; reason: string; kind?: string; ms: number; text?: string }[] = []
  for (const q of QS) {
    const t0 = Date.now()
    const r = await generalTier(q)
    rows.push({ q, status: r.status, reason: r.reason, kind: r.kind, ms: r.ms ?? Date.now() - t0, text: r.text })
    console.log(`${r.status.padEnd(8)} ${String(r.ms ?? 0).padStart(6)}ms ${(r.kind ?? "-").padEnd(10)} ${r.reason.padEnd(28)} | ${q}`)
  }
  fs.writeFileSync(process.env.EVAL_OUT ?? "/tmp/general-eval.json", JSON.stringify(rows, null, 1))
  const by = (s: string) => rows.filter((r) => r.status === s).length
  const ms = rows.filter((r) => r.status !== "skipped").map((r) => r.ms).sort((a, b) => a - b)
  const reasons: Record<string, number> = {}
  for (const r of rows.filter((x) => x.status === "rejected")) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
  console.log(`\n요약: shown ${by("shown")} · rejected ${by("rejected")} · skipped ${by("skipped")} / ${rows.length}`)
  console.log(`지연(생성 호출): p50 ${ms[Math.floor(ms.length * 0.5)]}ms · p95 ${ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))]}ms · 최대 ${ms[ms.length - 1]}ms`)
  console.log(`폐기 사유: ${JSON.stringify(reasons)}`)
}
main()
