// HW 표 → 게이트 어댑터 시험(운영에서 나온 실제 HW 단계 출력 고정본 사용).
import fs from "fs"
import { buildGateNote } from "../lib/gates-adapter"
import { parseSpec } from "../lib/design-gate"
const hw = fs.readFileSync(new URL("./fixtures-hw-sample.md", import.meta.url), "utf8")
const spec = parseSpec("농업용 방제 드론을 만들고 싶습니다. 페이로드 10kg, 비행거리 5km, 기체 크기 1.5m급 멀티로터, 비행시간 20분 이상.")
const note = buildGateNote({ spec, hwMd: hw, compareText: hw })
let fail = 0
const must = (name: string, ok: boolean) => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", name) }
must("G0 12S 710 Wh 계산", /12S lipo → 44\.4 V, 710\.4 Wh/.test(note))
must("G2 프롭 간섭 불합격(40in@1500mm)", /G2 형상·프롭 간섭 \| 🔴 불합격/.test(note))
must("G3 팁 마하 과다 불합격", /G3 추력\/중량 \| 🔴 불합격[^\n]*팁마하 0\.9/.test(note))
must("G6 체공 보수 가정 불합격", /G6 체공시간\(호버\) \| 🔴 불합격/.test(note))
must("상한(≤) 질량은 합산 제외", /상한값으로만 적혀 합산에서 제외: 프레임/.test(note))
must("링크 필요 수신 감도 계산", /수신 감도 ≤ -97 dBm/.test(note))
must("빈 HW 표는 빈 문자열", buildGateNote({ spec, hwMd: "" }) === "")
must("❌ 문자 미사용(점검 ❌ 집계와 분리)", !note.includes("❌"))
console.log(fail ? `FAIL ${fail}건` : "PASS 전부 통과"); process.exit(fail ? 1 : 0)
