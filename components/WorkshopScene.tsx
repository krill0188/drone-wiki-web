"use client"
import { useCallback, useEffect, useRef, useState } from "react"

// 드론 엔지니어 작업실 일러스트(사진 아님). 평소에는 가만히 있고 움직임은 사용자가 만질 때만 나온다.
//  · 왼쪽 모니터: 처음 한 번 코드가 써지고, 모니터를 누르면 다시 써진다
//  · 가운데 청사진: 처음 한 번, 그리고 마우스를 올리면 주황 스캔 선이 한 번 지나간다
//  · 드론: 올리면 프로펠러가 돌며 뜬다 · 오른쪽 그래프: 올리면 4초만 흐른다
// 시스템의 '동작 줄이기'(prefers-reduced-motion)가 켜져 있으면 처음 자동 재생만 멈춘다. 사용자가 직접 올리거나 누른 움직임과 '움직임 보기' 버튼은 그대로 동작한다(2026-10-25).
const LINES: [string, string][] = [
  ["# 질문이 답이 되는 순서", "#7d93ab"],
  ['q = ask("RTK와 PPK 차이?")', "#9fe2b8"],
  ["facts = graph.find(q)  # 출처 확인", "#7fb4ff"],
  ["table = render(facts) # 표는 코드가", "#7fb4ff"],
  ["text = explain(facts) # 쉬운 말로", "#7fb4ff"],
  ["check(text, facts)    # 다시 확인", "#7fb4ff"],
  ['print("출처와 함께 답해요 ✓")', "#ffb27a"],
]

export default function WorkshopScene() {
  const reduce = useRef(false)
  const [reduced, setReduced] = useState(false)
  const [li, setLi] = useState(0)
  const [ci, setCi] = useState(0)
  const [typing, setTyping] = useState(false)
  const [scanGo, setScanGo] = useState(false)
  const [t, setT] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const typeT = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback((user = false) => {
    if (typeT.current) clearTimeout(typeT.current)
    if (reduce.current && !user) { setLi(LINES.length); setCi(0); setTyping(false); return }
    setLi(0); setCi(0); setTyping(true)
    let l = 0, c = 0
    const step = () => {
      if (l >= LINES.length) { setTyping(false); return }
      c++
      if (c > LINES[l][0].length) { l++; c = 0; setLi(l); setCi(0); typeT.current = setTimeout(step, 200); return }
      setLi(l); setCi(c)
      typeT.current = setTimeout(step, 26)
    }
    step()
  }, [])
  const scan = useCallback((user = false) => {
    if (reduce.current && !user) return
    setScanGo(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setScanGo(true)))
  }, [])
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setReduced(reduce.current)
    run(); scan()
    return () => { if (typeT.current) clearTimeout(typeT.current); if (timer.current) clearInterval(timer.current) }
  }, [run, scan])

  const startGraph = (user = false) => {
    if ((reduce.current && !user) || timer.current) return
    let n = 0
    timer.current = setInterval(() => { setT((x) => x + 0.35); if (++n > 45 && timer.current) { clearInterval(timer.current); timer.current = null } }, 90)
  }
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < 24; i++) {
    const x = 22 + i * 10
    a.push(`${x},${(96 + Math.sin((i + t) / 3) * 22 + Math.sin((i + t) / 1.3) * 5).toFixed(1)}`)
    b.push(`${x},${(118 + Math.cos((i + t) / 4) * 14).toFixed(1)}`)
  }
  const done = li >= LINES.length
  const cy = Math.min(li, LINES.length - 1)
  const cx = 20 + (done ? LINES[cy][0].length : ci) * 6.3

  return (
    <div className="ws ws-scene" aria-label="드론 엔지니어 작업실 일러스트">
      <svg viewBox="0 0 1000 420" role="img" aria-label="왼쪽 모니터에 코드, 가운데 청사진과 드론, 오른쪽 모니터에 그래프가 있는 작업실">
        <defs>
          <pattern id="ws-peg" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1.8" fill="var(--ws-peg)" /></pattern>
          <pattern id="ws-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--ws-bpl)" strokeOpacity=".22" strokeWidth=".7" /></pattern>
          <linearGradient id="ws-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="1000" height="300" fill="var(--ws-wall)" />
        <rect width="1000" height="300" fill="url(#ws-peg)" />

        {/* 왼쪽 모니터: 코드 */}
        <g transform="translate(36,52)" role="button" tabIndex={0} aria-label="코드 다시 보기" style={{ cursor: "pointer" }} onClick={() => run(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(true) } }}>
          <rect width="270" height="178" rx="6" fill="#222c3a" stroke="#0c121b" strokeWidth="3" />
          <rect x="9" y="9" width="252" height="150" rx="3" fill="var(--ws-screen)" />
          <rect x="9" y="9" width="252" height="150" rx="3" fill="url(#ws-glow)" />
          <g className="ws-mono" fontSize="10.5">
            {LINES.map((l, i) => (
              <text key={i} x="20" y={36 + i * 18} fill={l[1]}>{i < li ? l[0] : i === li ? l[0].slice(0, ci) : ""}</text>
            ))}
            <rect className={typing ? "ws-cur" : ""} x={cx} y={26 + cy * 18} width="7" height="12" fill="#e8eef6" opacity={done ? 0 : 1} />
          </g>
          <rect x="111" y="178" width="48" height="16" fill="#222c3a" /><rect x="85" y="192" width="100" height="7" rx="2" fill="#222c3a" />
          <text x="14" y="172" fontSize="9.5" fill="#6d8199" className="ws-mono">main.py · 질문 → 근거 → 답 (누르면 다시)</text>
        </g>

        {/* 가운데: 청사진 */}
        <g transform="translate(330,26)" onMouseEnter={() => scan(true)} onClick={() => scan(true)}>
          <rect x="-3" y="-3" width="346" height="230" fill="none" stroke="var(--ws-ink)" strokeOpacity=".35" strokeWidth="2" />
          <rect width="340" height="224" fill="var(--ws-bp)" />
          <rect width="340" height="224" fill="url(#ws-grid)" />
          <g fill="none" stroke="var(--ws-bpl)" strokeWidth="1.6">
            <rect x="140" y="82" width="60" height="56" rx="6" />
            <path d="M146 88L82 38M194 88L258 38M146 132L82 184M194 132L258 184" strokeWidth="3" />
            <circle cx="76" cy="32" r="30" /><circle cx="264" cy="32" r="30" /><circle cx="76" cy="190" r="30" /><circle cx="264" cy="190" r="30" />
            <circle cx="76" cy="32" r="4" /><circle cx="264" cy="32" r="4" /><circle cx="76" cy="190" r="4" /><circle cx="264" cy="190" r="4" />
            <rect x="154" y="96" width="32" height="14" rx="2" /><circle cx="170" cy="124" r="5" />
          </g>
          <g fill="none" stroke="var(--ws-bpl)" strokeWidth="1"><path d="M76 214H264M76 208v12M264 208v12" /><path d="M12 32V190M6 32h12M6 190h12" /></g>
          <g fill="var(--ws-bpl)" fontSize="10.5" className="ws-mono" textAnchor="middle">
            <text x="170" y="210">휠베이스 (예시)</text><text x="170" y="222" fontSize="9" opacity=".7">설계 도우미가 계산해요</text><text x="170" y="158" fontSize="10">FC + IMU</text>
          </g>
          <g fill="var(--ws-bpl)" fontSize="9" className="ws-mono"><text x="206" y="106">GNSS</text><text x="206" y="118">RTK</text></g>
          <rect className={`ws-scan${scanGo ? " go" : ""}`} x="0" y="0" width="3" height="224" fill="var(--color-signal-500)" />
          <text x="8" y="14" fontSize="10" fill="var(--ws-bpl)" className="ws-mono">DRONE-HW-01 · 6단계 설계</text>
        </g>

        {/* 오른쪽 모니터: 그래프 */}
        <g transform="translate(694,52)" onMouseEnter={() => startGraph(true)} onClick={() => startGraph(true)}>
          <rect width="270" height="178" rx="6" fill="#222c3a" stroke="#0c121b" strokeWidth="3" />
          <rect x="9" y="9" width="252" height="150" rx="3" fill="var(--ws-screen)" />
          <rect x="9" y="9" width="252" height="150" rx="3" fill="url(#ws-glow)" />
          <g stroke="#2b3b50" strokeWidth="1"><path d="M20 40H250M20 76H250M20 112H250M20 140H250" /></g>
          <polyline fill="none" stroke="#8cc0ff" strokeWidth="2" points={a.join(" ")} />
          <polyline fill="none" stroke="var(--color-signal-500)" strokeWidth="1.6" strokeDasharray="4 3" points={b.join(" ")} />
          <text x="16" y="26" fontSize="10.5" fill="#9ab0c8" className="ws-mono">시연용 그래프(예시) · 지연/자세</text>
          <rect x="111" y="178" width="48" height="16" fill="#222c3a" /><rect x="85" y="192" width="100" height="7" rx="2" fill="#222c3a" />
          <text x="14" y="172" fontSize="9.5" fill="#6d8199" className="ws-mono">실제 값은 근거 센터에서 확인</text>
        </g>

        {/* 작업대 */}
        <rect y="296" width="1000" height="124" fill="var(--ws-bench)" />
        <rect y="296" width="1000" height="10" fill="var(--ws-bench2)" />
        <path d="M0 330H1000M0 372H1000" stroke="var(--ws-bench2)" strokeOpacity=".5" strokeWidth="2" />

        <g transform="translate(420,246)">
          <g className="ws-hover">
            <ellipse className="ws-prop" cx="20" cy="16" rx="26" ry="5" fill="#1b2430" /><ellipse className="ws-prop" cx="140" cy="16" rx="26" ry="5" fill="#1b2430" />
            <rect x="18" y="18" width="4" height="22" fill="#1b2430" /><rect x="138" y="18" width="4" height="22" fill="#1b2430" />
            <rect x="22" y="36" width="116" height="9" rx="4" fill="#2a3646" />
            <rect x="46" y="30" width="68" height="30" rx="9" fill="#f4f7fb" stroke="#1b2430" strokeWidth="3" />
            <rect x="62" y="40" width="14" height="11" fill="var(--ws-bp)" /><rect x="84" y="40" width="14" height="11" fill="var(--ws-bp)" />
            <circle cx="80" cy="64" r="5" fill="var(--color-signal-500)" />
            <rect x="56" y="62" width="6" height="12" fill="#1b2430" /><rect x="98" y="62" width="6" height="12" fill="#1b2430" />
          </g>
          <ellipse cx="80" cy="96" rx="60" ry="6" fill="#000" opacity=".22" />
        </g>
        <g transform="translate(120,262)"><rect width="86" height="34" rx="4" fill="#2f3b4d" /><rect x="5" y="6" width="62" height="22" rx="2" fill="#ff6a13" /><text x="9" y="21" fontSize="10.5" fill="#fff" className="ws-mono" fontWeight="700">6S 22.2V</text><rect x="72" y="8" width="10" height="6" fill="#d4b95e" /><rect x="72" y="20" width="10" height="6" fill="#d4b95e" /></g>
        <g transform="translate(730,262)"><path d="M0 30L90 8" stroke="#1b2430" strokeWidth="6" strokeLinecap="round" /><path d="M90 8L106 4" stroke="#b9c3cf" strokeWidth="4" strokeLinecap="round" /><circle cx="108" cy="4" r="5" fill="#ff4a2b" /></g>
        <g transform="translate(860,260)"><rect width="38" height="36" rx="5" fill="#f4f7fb" stroke="#1b2430" strokeWidth="3" /><path d="M38 10h10a8 8 0 0 1 0 16H38" fill="none" stroke="#1b2430" strokeWidth="3" /></g>
        <g transform="translate(250,276)"><rect width="46" height="12" rx="2" fill="#c8d2de" transform="rotate(-8 23 6)" /><rect x="-26" y="2" width="30" height="10" rx="2" fill="#ff6a13" transform="rotate(-8 23 6)" /></g>
      </svg>
      {reduced && (
        <div className="ws-playbar">
          <span>이 기기는 &lsquo;동작 줄이기&rsquo;가 켜져 있어 자동 재생을 멈췄어요.</span>
          <button type="button" onClick={() => { run(true); scan(true); startGraph(true) }}>▶ 움직임 보기</button>
        </div>
      )}
    </div>
  )
}
