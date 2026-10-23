import type { Check, Validation } from "./stage-validate"

// 교차 공학 규칙 검증기(2026-10-24): 온톨로지의 분야 간 결합(진동→IMU→항법, 연산 발열→제어 지연, RF 간섭→GNSS, 전원 노이즈, 링크 예산)을
// 프롬프트 문장이 아니라 서버 코드가 직접 확인한다. 선택한 부품(HW 단계 결과)에 결합 원인이 있는데 해당 단계 결과가 대응책을 말하지 않으면 위반으로 본다.
// 결정론: 키워드 기반이라 '말했는가'만 본다(내용의 옳고 그름은 판단하지 않는다). 기본 꺼짐(BUILDER_CROSS=on 또는 요청 cross:"on").
type Stage = "sw" | "techspec" | "architecture"
interface Rule {
  id: string
  label: string
  stages: Stage[]
  trigger: (hw: string, md: string) => boolean
  need: RegExp[] // 모두 만족해야 한다(각 정규식은 대응책 한 가지)
  hint: string
}

const T = (re: RegExp) => (hw: string, md: string) => re.test(`${hw}\n${md}`)
const RULES: Rule[] = [
  {
    id: "X1", label: "진동 → IMU → 항법", stages: ["techspec", "architecture"],
    trigger: T(/모터|프로펠러|motor|prop/i),
    need: [/방진|진동|vibration|소프트\s?마운트|댐핑|damp|노치|notch|저역\s?통과|필터/i],
    hint: "모터·프로펠러 진동이 IMU를 거쳐 자세·항법 오차가 되므로 방진 마운트 또는 IMU 필터링(노치·저역통과) 대응을 적는다.",
  },
  {
    id: "X2", label: "연산 발열 → 제어 지연", stages: ["sw", "architecture"],
    trigger: T(/jetson|젯슨|raspberry|라즈베리|\bnuc\b|컴패니언|companion|엣지\s?ai|ai\s?컴퓨터/i),
    need: [/발열|열\s?관리|thermal|쿨링|히트\s?싱크|스로틀|전력\s?모드/i, /페일\s?세이프|failsafe|fc가|비행\s?제어기가|지연|latency|offboard|오프보드/i],
    hint: "컴패니언 컴퓨터의 발열·전력 모드와, 컴퓨터가 멈춰도 비행 제어기가 최종 제어를 유지하는 구조(페일세이프·지연 허용)를 적는다.",
  },
  {
    id: "X3", label: "RF 간섭 → GNSS", stages: ["techspec", "architecture"],
    trigger: (hw, md) => /gnss|gps|rtk/i.test(hw) && /2\.4|5\.8|ghz|영상\s?전송|텔레메트리|데이터\s?링크|링크/i.test(`${hw}\n${md}`),
    need: [/이격|분리|차폐|shield|간섭|마스트|접지\s?판|ground\s?plane|안테나\s?위치|안테나\s?배치/i],
    hint: "영상·텔레메트리 송신기가 GNSS 수신을 방해하므로 안테나 이격·차폐·마스트 배치를 적는다.",
  },
  {
    id: "X4", label: "전원 노이즈 → 센서·무선", stages: ["techspec", "architecture"],
    trigger: T(/esc|배터리|battery|pdb|bec|컴패니언|jetson|라즈베리/i),
    need: [/bec|pdb|전원\s?분배|리플|노이즈|디커플링|캐패시터|필터|분리\s?전원|레귤레이터|ubec/i],
    hint: "ESC 스위칭 노이즈가 센서·무선·컴패니언 전원에 들어가므로 전원 분배(BEC·PDB)와 노이즈 필터 방안을 적는다.",
  },
  {
    id: "X5", label: "링크 예산(거리·대역)", stages: ["techspec", "architecture"],
    trigger: T(/영상|데이터\s?링크|텔레메트리|제어\s?링크|c2|elrs|lte|5g|무선/i),
    need: [/링크\s?예산|마진|\bdb\b|dbm|감쇠|프레넬|출력|대역폭|mbps|주파수/i],
    hint: "요구 거리에서 링크가 성립하는지 링크 예산(출력·감도·마진)이나 대역·주파수를 적는다. 법적 허용 여부는 재확인 필요로 표시한다.",
  },
]

export function crossChecks(stage: string, md: string, hwMd: string): Validation {
  const checks: Check[] = []
  const issues: string[] = []
  for (const r of RULES) {
    if (!(r.stages as string[]).includes(stage)) continue
    if (!r.trigger(hwMd, md)) continue
    const missing = r.need.filter((n) => !n.test(md))
    const ok = missing.length === 0
    checks.push({ ok, label: `교차 공학: ${r.label}`, detail: ok ? undefined : r.hint })
    if (!ok) issues.push(`교차 공학 규칙 ${r.id}(${r.label}): ${r.hint}`)
  }
  return { checks, issues }
}

export const CROSS_RULE_IDS = RULES.map((r) => r.id)
