// test-ontology.mjs — G2/G3(lib/ontology.ts) 런타임 검증.
// 이 프로젝트엔 테스트 프레임워크가 없어(package.json 확인됨) 표준
// Node.js만으로 작성. tsc로 컴파일된 산출물을 대상으로 검증한다.
//
// 실행:
//   npx tsc lib/ontology.ts --outDir /tmp/ts-test-out --module commonjs \
//     --target es2020 --esModuleInterop --skipLibCheck
//   node scripts/test-ontology.mjs
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const { loadHierarchy, getDescendants, expandQueryClassTerms } = require("/tmp/ts-test-out/ontology.js")

const WIKI_ROOT = process.env.HOME + "/2nd"
let pass = 0, fail = 0
function ok(name) { pass++; console.log(`PASS: ${name}`) }
function bad(name, detail) { fail++; console.log(`FAIL: ${name} — ${detail}`) }

try {
  const h = loadHierarchy(WIKI_ROOT)
  if (Object.keys(h).length > 30 && h["PX4"] === "FlightStack") {
    ok("클래스 계층 로드 정상(TS)")
  } else {
    bad("클래스 계층 로드", JSON.stringify(h).slice(0, 100))
  }
} catch (e) { bad("클래스 계층 로드", e.message) }

try {
  const h = loadHierarchy(WIKI_ROOT)
  const d = new Set(getDescendants("FlightStack", h))
  if (d.has("PX4") && d.has("ArduPilot") && d.size === 2) {
    ok("FlightStack 자손 = {PX4, ArduPilot} 정확(TS)")
  } else {
    bad("FlightStack 자손", [...d].join(","))
  }
} catch (e) { bad("FlightStack 자손", e.message) }

try {
  const terms = expandQueryClassTerms("FlightStack 비교해줘", WIKI_ROOT)
  const s = new Set(terms)
  if (s.has("PX4") && s.has("ArduPilot") && s.size === 2) {
    ok("'FlightStack' 질의 → PX4/ArduPilot 확장(TS)")
  } else {
    bad("질의 확장", terms.join(","))
  }
} catch (e) { bad("질의 확장", e.message) }

try {
  const terms = expandQueryClassTerms("오늘 날씨 어때", WIKI_ROOT)
  if (terms.length === 0) {
    ok("매칭 없는 질의는 빈 배열(TS, 억지 확장 없음)")
  } else {
    bad("매칭 없는 질의", terms.join(","))
  }
} catch (e) { bad("매칭 없는 질의", e.message) }

console.log(`\n${pass}/${pass + fail} 통과`)
process.exit(fail ? 1 : 0)
