import { parseSpec } from "../lib/design-gate"
import { matchProducts } from "../lib/product-match"
import { repairHwSelections, validateHw } from "../lib/stage-validate"

// 용도 적합성: 방제·운송 컨셉에는 카메라·센서 포드를 페이로드 후보로 주지 않고, 모델이 골라도 서버가 '후보 없음'으로 바꾼다.
let fail = 0
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fail++ }
const spray = parseSpec("농업용 방제 드론. 페이로드 10kg, 비행거리 5km, 기체 크기 1.5m급 멀티로터, 비행시간 30분")
const survey = parseSpec("정찰·열화상 촬영 드론. 페이로드 1kg, 비행거리 5km, 기체 크기 900mm 멀티로터, 비행시간 30분")
const cargo = parseSpec("물류 배송 드론. 페이로드 3kg, 비행거리 4km, 기체 크기 900mm 멀티로터, 비행시간 25분")
ok(spray.purpose === "spray", "방제 → spray")
ok(survey.purpose === "sensing", "정찰·열화상 → sensing")
ok(cargo.purpose === "cargo", "배송 → cargo")
const ms = matchProducts(spray), mv = matchProducts(survey)
ok(!!ms.block && !/Zenmuse|SIYI|FLIR|MicaSense/.test(ms.block.split("[페이로드")[1]?.split("[")[0] ?? ""), "방제 블록에 센서 포드 후보 없음")
ok(/약제 탱크.*카탈로그에 없다/.test(ms.block ?? ""), "방제 블록이 '없음'과 쓸 문구를 명시")
ok(/페이로드\(카메라·센서 포드\) 후보/.test(mv.block ?? ""), "정찰 블록은 센서 포드 후보 유지")
if (ms.data) {
  const md = `| 구성요소 | 온톨로지 클래스 | 선정안 | 핵심 사양 | 인터페이스 | 근거 |\n|---|---|---|---|---|---|\n| 페이로드 | Payload | DJI Zenmuse L2 (LiDAR + RGB) | 905g | Skyport | 공식 |\n`
  const r = repairHwSelections(md, ms.data)
  ok(r.repaired.length === 1 && r.md.includes("카탈로그 후보 없음 — 확인 필요"), "모델이 센서 포드를 골라도 후보 없음으로 치환")
  ok(validateHw(r.md, ms.data).checks.find((c) => c.label.startsWith("선정안은 모두"))?.ok === true, "치환 후 검증 통과")
}
process.exit(fail ? 1 : 0)
