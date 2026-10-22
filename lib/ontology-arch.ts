import archFile from "@/data/ontology/architecture.json"

// 기본구조 온톨로지 기반 교차 공학 추론(2026-10-17).
// ① 주제별 HW/SW 기본구조 ② 임무→능력→구성요소 제약 기반 선택(숨은 의존성 폐포)
// ③ 통신 링크·주파수·이기종 프로토콜 경로 ④ 분야 간 결합(커플링) 파급 추적 ⑤ 대안 아키텍처 가설.
// 데이터는 저자 정의 설계 지식(architecture.json, 검토 필요) — 제품 수치의 사실 근거가 아니다.

interface Comp { id: string; name: string; layer: string; disc: string[]; provides: string[]; requires: string[]; note: string }
interface Link { id: string; name: string; freqMHz: number; bwMbps: number; rangeKm: [number, number]; latencyMs: [number, number]; infraFree: boolean; multiNode: boolean; note: string }
interface Adapter { a: string; b: string; via: string; maturity: string }
interface Coupling { from: string; to: string; disc: string[]; why: string }
interface Topic { id: string; name: string; alias: string; components: string[]; summary: string }
interface Mission { id: string; name: string; alias: string; requires: string[] }
interface Arch {
  disciplines: Record<string, string>; capabilities: Record<string, string>
  components: Comp[]; links: Link[]; protocols: string[]; adapters: Adapter[]
  couplings: Coupling[]; factors: Record<string, string>; topics: Topic[]; missions: Mission[]
}
const A = archFile as unknown as Arch
const COMP = new Map(A.components.map((c) => [c.id, c]))
const DISC = A.disciplines
const CAP = A.capabilities

const LABEL: Record<string, string> = {
  payload_mass: "페이로드 질량↑", hover_power: "호버링 전력↑", flight_time: "비행시간↓", esc_motor_heat: "구동계 발열↑", frame_stress: "프레임 응력↑",
  vibration: "진동↑", imu_noise: "IMU 잡음↑", ekf_drift: "상태추정 드리프트", image_blur: "영상 블러", vio_loss: "VIO 추적 상실", gnss_denied: "GNSS 불가",
  need_nongnss: "비GNSS 항법 필요", compute_load: "연산 부하↑", power_draw: "소비전력↑", soc_heat: "컴퓨터 발열↑", thermal_throttle: "클럭 저하",
  inference_latency: "추론 지연↑", control_delay: "제어 루프 지연", video_bitrate: "영상 비트레이트↑", link_bw_demand: "링크 대역 요구↑", range_loss: "도달거리↓",
  range: "운용 거리↑", fspl_loss: "자유공간 손실↑", link_margin_low: "링크 마진↓", failsafe_trigger: "페일세이프 발동", tx_power: "송신 출력↑", emi: "전자기 간섭↑",
  mag_gnss_noise: "지자기/GNSS 간섭", swarm_size: "군집 규모↑", mesh_traffic: "메시 트래픽↑", latency: "통신 지연↑", formation_instability: "편대 불안정",
  dds_discovery: "DDS 디스커버리 트래픽↑", time_offset: "시간 불일치", fusion_error: "융합 오차↑", relative_loc_loss: "상대위치 상실", cold: "저온",
  battery_resistance: "배터리 내부저항↑", voltage_sag: "전압 강하", brownout_risk: "브라운아웃 위험", altitude: "고도↑", air_density_low: "공기밀도↓",
  rain_fog: "비·안개·연기", lidar_degrade: "LiDAR 열화", eo_degrade: "EO 열화", radar_robust: "레이더는 비교적 견딤", night: "야간·저조도", detect_miss: "표적 미검출",
  wind: "강풍", position_error: "위치 오차↑", payload_drop: "투하 실행", cg_shift: "무게중심 급변", attitude_transient: "자세 과도응답",
}
const lab = (id: string) => LABEL[id] ?? id

const rx = (s: string) => new RegExp(s, "i")

// ── 환경·제약 조건이 구성요소 선택에 주는 영향(제약 기반 선택) ──
interface Pref { when: RegExp; prefer?: string[]; avoid?: string[]; why: string }
const PREFS: Pref[] = [
  { when: rx("비\\b|우천|안개|연기|분진|연무"), prefer: ["radar"], avoid: ["lidar"], why: "비·연기·분진에서 LiDAR/가시광 열화, mmWave 레이더 상대적 강건" },
  { when: rx("야간|밤|저조도"), prefer: ["camera_ir", "lidar_slam"], avoid: ["vio", "camera_eo"], why: "저조도에서 EO·VIO 열화 → 열화상·LiDAR 계열" },
  { when: rx("non.?gps|비.?gps|gps.?(없|불가|거부|음영)|gnss.?denied|재밍|스푸핑|실내|터널|지하"), prefer: ["vio", "lidar_slam", "uwb", "optflow_rf"], avoid: ["gnss"], why: "GNSS 의존 제거 — 상대관측 기반 항법 필요" },
  { when: rx("재난|산악|해상|오지|인프라 ?(없|두절)|기지국 ?(없|두절)"), prefer: ["radio_mesh", "satcom"], avoid: ["modem_lte"], why: "통신 인프라 두절 가정 — 인프라 불요 링크 우선" },
  { when: rx("실내|터널|지하|건물 ?내"), prefer: ["lidar_slam", "tof_us"], avoid: ["modem_lte", "gnss"], why: "실내는 GNSS·셀룰러 도달 불량" },
]
const INFRA_FREE = rx("재난|산악|해상|오지|인프라 ?(없|두절)|기지국 ?(없|두절)")

// ── 감지 ──
function topicsOf(q: string) { return A.topics.filter((t) => rx(t.alias).test(q)) }
function missionsOf(q: string) { return A.missions.filter((m) => rx(m.alias).test(q)) }
function factorsOf(q: string) { return Object.entries(A.factors).filter(([, r]) => rx(r).test(q)).map(([k]) => k) }

const discNames = (ids: string[]) => [...new Set(ids)].map((d) => DISC[d] ?? d).join("·")
const providers = (cap: string) => A.components.filter((c) => c.provides.includes(cap))

// ── ① 기본구조 ──
function structure(topics: Topic[]): string[] {
  return topics.slice(0, 4).map((t) => {
    const comps = t.components.map((id) => COMP.get(id)!).filter(Boolean)
    const hw = comps.filter((c) => c.layer.includes("HW")).map((c) => c.name)
    const sw = comps.filter((c) => c.layer.includes("SW")).map((c) => c.name)
    const discs = comps.flatMap((c) => c.disc)
    return `- [${t.name}] ${t.summary}\n  HW: ${hw.join(", ") || "-"}\n  SW: ${sw.join(", ") || "-"}\n  관여 분야: ${discNames(discs)}`
  })
}

// ── ② 임무 → 능력 → 구성요소(제약 기반 선택 + 숨은 의존성 폐포) ──
function compose(missions: Mission[], q: string) {
  const prefer = new Set<string>(), avoid = new Set<string>()
  const whys: string[] = []
  for (const p of PREFS) if (p.when.test(q)) { p.prefer?.forEach((x) => prefer.add(x)); p.avoid?.forEach((x) => avoid.add(x)); whys.push(p.why) }
  const chosen = new Map<string, { comp: Comp; alt: Comp[]; reason: string }>()
  const unresolved: string[] = []
  const explicit = new Set(missions.flatMap((m) => m.requires.flatMap((r) => r.split("|"))))

  const pick = (capExpr: string): string | null => {
    const caps = capExpr.split("|")
    const done = caps.find((c) => chosen.has(c))
    if (done) return done
    const options = caps.flatMap((c) => providers(c).map((p) => ({ cap: c, p })))
    if (options.length === 0) { unresolved.push(capExpr); return null }
    const score = (id: string) => (prefer.has(id) ? 2 : 0) - (avoid.has(id) ? 3 : 0)
    options.sort((x, y) => score(y.p.id) - score(x.p.id))
    const best = options[0]
    const alt = options.slice(1).map((o) => o.p).filter((p, i, a) => a.findIndex((z) => z.id === p.id) === i && p.id !== best.p.id)
    const reason = prefer.has(best.p.id) ? "환경 조건상 우선" : avoid.has(best.p.id) ? "대안 부재로 불가피(제약 위반 위험)" : "기본 선택"
    chosen.set(best.cap, { comp: best.p, alt, reason })
    for (const r of best.p.requires) pick(r)
    return best.cap
  }
  for (const m of missions) for (const r of m.requires) pick(r)
  return { chosen, unresolved, explicit, whys }
}

// ── ③ 통신 ──
const fspl = (km: number, mhz: number) => 20 * Math.log10(km) + 20 * Math.log10(mhz) + 32.44

function commsBlock(q: string): string[] {
  const out: string[] = []
  const dist = q.match(/(\d+(?:\.\d+)?)\s*km/i)
  const km = dist ? parseFloat(dist[1]) : undefined
  const bwM = q.match(/(\d+(?:\.\d+)?)\s*mbps/i)
  const video = /영상|fpv|스트리밍|1080|4k|fhd/i.test(q)
  const needBw = bwM ? parseFloat(bwM[1]) : video ? 4 : 0
  const infra = INFRA_FREE.test(q)
  const multi = /군집|swarm|다수|메시|mesh|\d+\s*대/i.test(q)
  const alt = q.match(/고도\D{0,4}(\d{2,4})\s*m\b/i)
  const h = alt ? parseFloat(alt[1]) : undefined

  const lines = A.links.map((l) => {
    const why: string[] = []
    let ok = true
    if (km !== undefined && l.rangeKm[1] < km) { ok = false; why.push(`일반 도달거리 상한 ${l.rangeKm[1]}km < 요구 ${km}km`) }
    if (needBw && l.bwMbps < needBw) { ok = false; why.push(`일반 대역 ${l.bwMbps}Mbps < 요구 ${needBw}Mbps`) }
    if (infra && !l.infraFree) { ok = false; why.push("통신 인프라 두절 가정에서 사용 불가") }
    if (multi && !l.multiNode) why.push("다중 노드·멀티홉 지원 약함")
    const loss = km !== undefined ? ` FSPL(${km}km)=${fspl(km, l.freqMHz).toFixed(0)}dB` : ""
    return { ok, text: `- ${ok ? "✓" : "✗"} ${l.name} [대역 ~${l.bwMbps}Mbps, 거리 ${l.rangeKm[0]}~${l.rangeKm[1]}km, 지연 ${l.latencyMs[0]}~${l.latencyMs[1]}ms${loss}]${why.length ? " — " + why.join("; ") : ""}`, score: (ok ? 10 : 0) + (multi && l.multiNode ? 2 : 0) - l.latencyMs[0] / 100 }
  })
  lines.sort((a, b) => b.score - a.score)
  out.push(`링크 후보 평가(조건: ${[km !== undefined ? `거리 ${km}km` : "", needBw ? `대역 ≥${needBw}Mbps` : "", infra ? "인프라 불요" : "", multi ? "다중 노드" : ""].filter(Boolean).join(", ") || "미지정"} — 일반 범위, 제품·법규별 상이):`)
  out.push(...lines.map((l) => l.text))
  if (km !== undefined && h !== undefined) {
    const horizon = 4.12 * (Math.sqrt(h) + Math.sqrt(2))
    out.push(`전파 가시선(LOS): 고도 ${h}m·지상 안테나 2m 가정 라디오 수평선 ≈ ${horizon.toFixed(1)}km ${km > horizon ? `→ 요구 ${km}km는 수평선 초과: 고도 상향·중계기 필요` : "→ 요구 거리는 수평선 이내"}`)
  } else if (km !== undefined) {
    out.push("전파 가시선(LOS): 운용 고도를 알려 주면 라디오 수평선 한계(≈4.12(√h₁+√h₂) km)로 도달 가능성을 판정할 수 있음")
  }
  out.push("주의: 국내 허용 대역·출력은 법규 재확인 필요(이 목록은 법적 허용 여부를 판정하지 않음). 영상·C2·텔레메트리는 링크를 분리해 설계하는 것이 기본.")
  return out
}

const PROTO_ALIAS: [string, RegExp][] = [
  ["MAVLink", rx("mavlink|mavros")], ["ROS2/DDS", rx("ros ?2|\\bdds\\b")], ["ROS1", rx("\\bros ?1\\b|ros(?! ?2)\\b(?!\\w)")],
  ["uORB(PX4)", rx("uorb|px4")], ["DroneCAN", rx("dronecan|uavcan|\\bcan\\b")], ["CRSF/SBUS", rx("crsf|sbus|elrs")], ["CoT(ATAK)", rx("\\bcot\\b|atak|cursor.?on.?target")],
  ["STANAG4586", rx("stanag")], ["RTSP/RTP", rx("rtsp|rtp\\b|gstreamer")], ["MQTT", rx("mqtt")], ["Zenoh", rx("zenoh")], ["WebSocket(rosbridge)", rx("rosbridge|websocket")],
  ["DJI-SDK", rx("dji|msdk|osdk")], ["OpenDroneID", rx("remote ?id|원격 ?식별|opendroneid")],
]

function protoPaths(q: string): string[] {
  const found = PROTO_ALIAS.filter(([, r]) => r.test(q)).map(([n]) => n)
  const nodes = [...new Set(found)]
  if (nodes.length < 2) return []
  const adj = new Map<string, { to: string; via: string; m: string }[]>()
  const add = (a: string, b: string, via: string, m: string) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push({ to: b, via, m }) }
  for (const e of A.adapters) { add(e.a, e.b, e.via, e.maturity); add(e.b, e.a, e.via, e.maturity) }
  const bfs = (s: string, t: string) => {
    const prev = new Map<string, { from: string; via: string; m: string }>()
    const seen = new Set([s]); const queue = [s]
    while (queue.length) {
      const c = queue.shift()!
      if (c === t) break
      for (const n of adj.get(c) ?? []) if (!seen.has(n.to)) { seen.add(n.to); prev.set(n.to, { from: c, via: n.via, m: n.m }); queue.push(n.to) }
    }
    if (!seen.has(t)) return null
    const path: string[] = []
    let cur = t
    while (cur !== s) { const p = prev.get(cur)!; path.unshift(`${p.from} →(${p.via}; ${p.m})→ ${cur}`); cur = p.from }
    return path
  }
  const lines: string[] = []
  for (let i = 0; i < nodes.length && lines.length < 6; i++) for (let j = i + 1; j < nodes.length && lines.length < 6; j++) {
    const p = bfs(nodes[i], nodes[j])
    lines.push(p ? `- ${nodes[i]} ↔ ${nodes[j]}: ${p.length}단계\n    ${p.join("\n    ")}` : `- ${nodes[i]} ↔ ${nodes[j]}: 알려진 어댑터 경로 없음 → 공통 허브(ROS2/DDS 또는 MQTT) 경유 게이트웨이를 신규 설계해야 함(좌표계·시간·메시지 스키마 매핑 포함)`)
  }
  return lines
}

// ── ④ 결합(커플링) 파급 ──
function couplingChains(factors: string[]): string[] {
  const adj = new Map<string, Coupling[]>()
  for (const c of A.couplings) { if (!adj.has(c.from)) adj.set(c.from, []); adj.get(c.from)!.push(c) }
  const paths: { text: string; cross: number; len: number }[] = []
  const walk = (node: string, trail: Coupling[], seen: Set<string>) => {
    const next = (adj.get(node) ?? []).filter((e) => !seen.has(e.to))
    if ((next.length === 0 || trail.length >= 4) && trail.length >= 2) {
      const discs = new Set(trail.flatMap((e) => e.disc))
      paths.push({ text: `${lab(trail[0].from)} ${trail.map((e) => `→[${discNames(e.disc)}] ${lab(e.to)}`).join(" ")}`, cross: discs.size, len: trail.length })
    }
    if (trail.length >= 4) return
    for (const e of next) walk(e.to, [...trail, e], new Set([...seen, e.to]))
  }
  for (const f of factors) walk(f, [], new Set([f]))
  const uniq = [...new Map(paths.map((p) => [p.text, p])).values()]
  uniq.sort((a, b) => b.cross - a.cross || b.len - a.len)
  return uniq.slice(0, 10).map((p) => `- ${p.text}`)
}

// ── 종합 ──
export interface ArchResult { block: string; topics: string[]; missions: string[] }

export function architectureBlock(q: string): ArchResult {
  const topics = topicsOf(q)
  const missions = missionsOf(q)
  const factors = factorsOf(q)
  const protoLines = protoPaths(q)
  // 링크 평가는 통신 질의이거나, 거리·대역 조건이 있거나, 통신이 핵심인 임무(군집·정찰·구조)일 때만
  const commsAsked =
    /통신 ?방식|링크|datalink|주파수|대역|전파|mhz|ghz|c2|텔레메트리|메시|mbps|\d+\s*km/i.test(q) ||
    missions.some((m) => ["swarm", "recon", "rescue"].includes(m.id))
  if (!topics.length && !missions.length && !commsAsked && !protoLines.length && factors.length < 2) return { block: "", topics: [], missions: [] }

  const parts: string[] = []
  if (topics.length) parts.push(`기본구조(HW+SW 계층):\n${structure(topics).join("\n")}`)

  if (missions.length) {
    const { chosen, unresolved, explicit, whys } = compose(missions, q)
    const rows = [...chosen.entries()].slice(0, 30).map(([cap, v]) => {
      const hidden = explicit.has(cap) ? "" : " ★숨은 의존성"
      const alt = v.alt.length ? ` | 대안: ${v.alt.slice(0, 3).map((a) => a.name).join(", ")}` : ""
      return `- ${CAP[cap] ?? cap} ← ${v.comp.name} (${discNames(v.comp.disc)}; ${v.reason})${hidden}${alt}`
    })
    const allDisc = [...chosen.values()].flatMap((v) => v.comp.disc)
    parts.push(`임무 분해(${missions.map((m) => m.name).join(" + ")}) → 필요 능력 → 선택 구성요소(제약 기반):${whys.length ? `\n적용된 환경 제약: ${whys.join(" / ")}` : ""}\n${rows.join("\n")}${unresolved.length ? `\n제공 구성요소 없음(온톨로지 빈틈): ${unresolved.join(", ")}` : ""}\n관여 공학 분야: ${discNames(allDisc)} (총 ${chosen.size}개 능력, ★=임무에 명시되지 않았으나 연쇄 요구로 드러난 의존성)`)
  }

  if (commsAsked) parts.push(commsBlock(q).join("\n"))
  if (protoLines.length) {
    {
      parts.push(`이기종 프로토콜 연동 경로(어댑터 그래프 최단경로):\n${protoLines.join("\n")}`)
    }
  }

  const chains = factors.length ? couplingChains(factors) : []
  if (chains.length) parts.push(`분야 간 결합 파급(질문 속 요인 → 2~4차 효과, 교차 분야 많은 순):\n${chains.join("\n")}`)

  const body = parts.join("\n\n")
  const block = `<architecture>
기본구조 온톨로지(저자 정의 설계 지식 — 검토 필요, 제품 수치의 사실 근거 아님)에서 규칙으로 도출한 결과다. 구성요소·능력·결합 관계는 그대로 사용하고, 일반 범위 수치는 "일반적으로"라고 한정해 말할 것.
${body}
창조 지침(반드시 수행): ① 위 폐포·파급에서 사용자가 묻지 않았지만 설계를 깨뜨릴 교차 분야 연쇄(예: 기계 진동→IMU→항법, 연산 발열→제어 지연)를 짚는다. ② 선택 구성요소 외에 최소 1개의 대안 아키텍처를 "가설"로 라벨링해 제안하고 트레이드오프(분야별)와 검증 실험(SITL/HIL/벤치)을 붙인다. ③ 이기종 연동은 허브·어댑터·좌표계/시간 동기까지 포함한 구체 설계로 말한다. ④ 온톨로지에 없는 사실은 "재확인 필요"로 표시하고 임의 수치를 만들지 않는다.
</architecture>`
  return { block, topics: topics.map((t) => t.id), missions: missions.map((m) => m.id) }
}
