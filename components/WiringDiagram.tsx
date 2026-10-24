"use client"
import { useState } from "react"

// 배선도(예시): Cube 계열 비행제어기를 쓰는 멀티로터의 일반적인 배선 구성을 자체 제작한 도식이다(제조사 이미지·로고는 쓰지 않았다).
// 선 종류별(전원·제어 신호·CAN·무선 링크·조종·센서)로 누르면 해당 선만 강조된다. 움직임 없이 색과 굵기로만 보여 준다.
type G = "power" | "pwm" | "can" | "uart" | "rc" | "i2c"
const GROUPS: { key: G | "all"; label: string; color: string; hint: string }[] = [
  { key: "all", label: "전체", color: "var(--color-ink)", hint: "모든 선" },
  { key: "power", label: "전원", color: "#d63a2f", hint: "배터리 → 전력 모듈 → 분배 보드 → ESC → 모터" },
  { key: "pwm", label: "제어 신호", color: "#ff7a1a", hint: "비행제어기 MAIN OUT → ESC (PWM/DShot)" },
  { key: "can", label: "CAN 통신", color: "#2f7fc1", hint: "GNSS·광학흐름을 CAN 분배기로 연결" },
  { key: "uart", label: "무선 링크", color: "#2ea35a", hint: "텔레메트리·영상 링크(TELEM 포트, UART)" },
  { key: "rc", label: "조종(RC)", color: "#8a5bd6", hint: "수신기 → RCIN" },
  { key: "i2c", label: "센서·페이로드", color: "#12a5a5", hint: "거리계·IR 착륙 센서(I2C), 서보(AUX OUT)" },
]
const C = Object.fromEntries(GROUPS.map((g) => [g.key, g.color])) as Record<string, string>

function Box({ x, y, w, h, t, s }: { x: number; y: number; w: number; h: number; t: string; s?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="var(--color-panel)" stroke="var(--color-ink)" strokeWidth="2" />
      <text x={x + w / 2} y={y + (s ? h / 2 - 3 : h / 2 + 5)} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-ink)">{t}</text>
      {s && <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-dim)">{s}</text>}
    </g>
  )
}

export default function WiringDiagram() {
  const [hl, setHl] = useState<G | "all">("all")
  const line = (g: G, d: string, w = 3) => (
    <path d={d} fill="none" stroke={C[g]} strokeWidth={hl === g ? w + 2 : w} strokeLinecap="round" strokeLinejoin="round" opacity={hl === "all" || hl === g ? 1 : 0.12} />
  )
  const port = (x: number, y: number, t: string, anchor: "start" | "end" | "middle" = "start") => (
    <text x={x} y={y} fontSize="9.5" textAnchor={anchor} fill="#e8eef6" className="ws-mono">{t}</text>
  )
  const active = GROUPS.find((g) => g.key === hl)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="선 종류 보기">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            aria-pressed={hl === g.key}
            onClick={() => setHl(g.key)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[13px] transition-colors"
            style={hl === g.key ? { background: "var(--color-ink)", color: "var(--color-paper)", borderColor: "var(--color-ink)" } : { background: "var(--color-panel)", color: "var(--color-ink)", borderColor: "var(--color-line)" }}
          >
            <span aria-hidden className="inline-block w-3 h-1.5 rounded-sm" style={{ background: g.key === "all" ? "#8a97a6" : g.color }} />
            {g.label}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-ink-dim mb-2 min-h-[1.4em]" aria-live="polite">{active?.hint}</p>
      <div className="overflow-x-auto rounded-lg border-2 border-ink" style={{ background: "var(--ws-wall, var(--color-paper))" }}>
        <div className="ws" style={{ minWidth: 760 }}>
          <svg viewBox="0 0 960 660" role="img" aria-label="Cube 계열 비행제어기를 쓰는 멀티로터의 배선도 예시" className="block w-full h-auto">
            {/* 선(상자 아래) */}
            {line("can", "M170 85H190M170 155H190M190 85V155M190 120H215")}
            {line("can", "M305 120H340V200H380")}
            {line("uart", "M170 260H300V250H380")}
            {line("rc", "M170 355H380V350")}
            {line("power", "M770 215H820")}
            {line("power", "M640 215H610V200H580")}
            {line("i2c", "M700 285H620V250H580")}
            {line("i2c", "M700 355H630V300H580")}
            {line("power", "M655 240V492H520")}
            {line("pwm", "M420 400V440H230V545")}
            {line("pwm", "M450 400V452H410V545")}
            {line("pwm", "M510 400V452H610V545")}
            {line("pwm", "M540 400V440H790V545")}
            {line("power", "M480 514V530H190V545M480 530H370V545M480 530H570V545M480 530H750V545")}
            {[210, 390, 590, 770].map((cx) => (
              <g key={cx}>{line("power", `M${cx - 10} 581V595M${cx} 581V595M${cx + 10} 581V595`, 2.5)}</g>
            ))}
            {/* 상자 */}
            <Box x={40} y={60} w={130} h={50} t="GNSS(RTK)" s="CAN" />
            <Box x={40} y={130} w={130} h={50} t="광학흐름·거리계" s="CAN" />
            <Box x={215} y={95} w={90} h={50} t="CAN 분배기" />
            <Box x={40} y={235} w={130} h={50} t="원격측정·영상 링크" s="TELEM (UART)" />
            <Box x={40} y={330} w={130} h={50} t="조종 수신기" s="RCIN / SBUS" />
            <Box x={640} y={190} w={130} h={50} t="전력 모듈" s="전류·전압 센서" />
            <Box x={820} y={190} w={110} h={50} t="배터리" s="예: 6S~12S" />
            <Box x={700} y={260} w={150} h={50} t="거리계 · IR 착륙 센서" s="I2C" />
            <Box x={700} y={330} w={150} h={50} t="서보 · 페이로드" s="AUX OUT" />
            <Box x={440} y={470} w={80} h={44} t="분배 보드" s="PDB" />
            {[150, 330, 530, 710].map((x, i) => (<Box key={x} x={x} y={545} w={120} h={36} t={`ESC ${i + 1}`} />))}
            {[210, 390, 590, 770].map((cx, i) => (
              <g key={cx}><circle cx={cx} cy={622} r="24" fill="var(--color-panel)" stroke="var(--color-ink)" strokeWidth="2" /><text x={cx} y={619} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-ink)">모터 {i + 1}</text><text x={cx} y={633} textAnchor="middle" fontSize="10" fill="var(--color-ink-dim)">{i === 0 || i === 3 ? "CW" : "CCW"}</text></g>
            ))}
            {/* 비행제어기 */}
            <rect x="380" y="170" width="200" height="230" rx="10" fill="#222c3a" stroke="var(--color-ink)" strokeWidth="2.5" />
            <rect x="410" y="215" width="140" height="120" rx="10" fill="#ff8a3d" />
            <text x="480" y="268" textAnchor="middle" fontSize="18" fontWeight="800" fill="#18222f">비행제어기</text>
            <text x="480" y="288" textAnchor="middle" fontSize="11.5" fill="#18222f">예: Cube 계열</text>
            <text x="480" y="304" textAnchor="middle" fontSize="10.5" fill="#18222f">PX4 · ArduPilot</text>
            {port(386, 204, "CAN")}{port(386, 254, "TELEM1")}{port(386, 354, "RCIN")}
            {port(574, 204, "POWER1", "end")}{port(574, 254, "I2C", "end")}{port(574, 304, "AUX OUT", "end")}
            {port(420, 394, "M1", "middle")}{port(450, 394, "M2", "middle")}{port(510, 394, "M3", "middle")}{port(540, 394, "M4", "middle")}
            <text x="480" y="650" textAnchor="middle" fontSize="10.5" fill="var(--color-ink-dim)">센서·무선은 별도 5V 강압 모듈로 급전하는 것이 일반적이에요(표시 생략)</text>
          </svg>
        </div>
      </div>
    </div>
  )
}
