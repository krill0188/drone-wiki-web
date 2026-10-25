// 재작성 트리거(가정 없는 위반만) 시험: 전압 표기 오류·프롭 간섭·제거 부품 재등장은 잡고, 정상·만충 전압 표기는 건드리지 않는다.
import fs from "fs"
import { assumptionFreeGateIssues } from "../lib/gates-adapter"
import { removedPartsReappear } from "../lib/stage-consistency"
import { parseSpec } from "../lib/design-gate"
const hw = fs.readFileSync(new URL("./fixtures-hw-sample.md", import.meta.url), "utf8")
const spec = parseSpec("농업용 방제 드론을 만들고 싶습니다. 페이로드 10kg, 비행거리 5km, 기체 크기 1.5m급 멀티로터, 비행시간 20분 이상.")
let fail = 0
const must = (n: string, ok: boolean) => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n) }
const i1 = assumptionFreeGateIssues(spec, hw)
must("40인치 프롭@1500mm 쿼드는 G2 위반", i1.some((x) => x.startsWith("G2")))
must("12S(50.4V 만충 표기)는 G0 위반이 아니다", !i1.some((x) => x.startsWith("G0")))
const small = hw.replace(/40인치/g, "30인치")
must("30인치면 G2 위반 없음", !assumptionFreeGateIssues(spec, small).some((x) => x.startsWith("G2")))
const badV = hw.replace("전압: 12S(50.4V 임의)", "전압: 12S(7.4V)")
must("12S인데 7.4V 선언은 G0 위반", assumptionFreeGateIssues(spec, badV).some((x) => x.startsWith("G0")))
must("확정 스펙에서 프롭이 줄면 G2 해소", !assumptionFreeGateIssues(spec, hw, "## 5. 확정 기술 스펙 요약\n1. **프롭**: 지름 30인치 · 4개\n2. **배터리**: 12S · 16 Ah\n").some((x) => x.startsWith("G2")))
must("입력이 없으면 아무 이슈도 없다", assumptionFreeGateIssues(spec, "") .length === 0)
const hwRepaired = hw + `\n\n> 서버 치환 2건 (모델이 카탈로그 밖 제품을 골라 코드가 바꿈): 모터: "KDE Direct KDE5215XF-435 (435KV)" → T-MOTOR MN701-S ; ESC: "KDE UAS95HVC" → 후보 없음`
must("제거된 부품(KDE5215XF-435)이 다시 나오면 감지", removedPartsReappear(hwRepaired, "모터는 KDE5215XF-435를 쓴다").length === 1)
must("다른 부품만 쓰면 감지 안 함", removedPartsReappear(hwRepaired, "모터는 MN701-S를 쓴다").length === 0)
must("치환 메모가 없으면 감지 안 함", removedPartsReappear(hw, "KDE5215XF-435").length === 0)
console.log(fail ? `FAIL ${fail}건` : "PASS 전부 통과"); process.exit(fail ? 1 : 0)
