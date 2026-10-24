// 하드게이트 포팅 정확성 시험: 원본(drone_gates.py) 데모 스펙 두 건의 핵심 수치가 같게 나와야 한다.
import fs from "fs"
import { runGates, type CoreSpec } from "../lib/gates-core"
const [orig, rev] = JSON.parse(fs.readFileSync(new URL("./fixtures-gates-demo.json", import.meta.url), "utf8")) as CoreSpec[]
let fail = 0
const near = (name: string, got: number, want: number, tol: number) => { const ok = Math.abs(got - want) <= tol; if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", name, got.toFixed(3), "기대", want) }
const pick = (rep: ReturnType<typeof runGates>, key: string) => rep.gates.find((g) => g.gate.startsWith(key))!
const a = runGates(orig), b = runGates(rev)
near("원본 AUW(kg)", a.auwKg, 2.377, 0.002)
near("수정안 AUW(kg)", b.auwKg, 0.978, 0.002)
const num = (s: string, re: RegExp) => parseFloat(re.exec(s)![1])
near("원본 T/W", num(pick(a, "G3").value, /T\/W ([\d.]+)/), 0.24, 0.01)
near("수정안 T/W", num(pick(b, "G3").value, /T\/W ([\d.]+)/), 5.11, 0.02)
near("원본 체공 보수(분)", num(pick(a, "G6").value, /보수 ([\d.]+)분/), 2.0, 0.1)
near("수정안 체공 보수(분)", num(pick(b, "G6").value, /보수 ([\d.]+)분/), 20.2, 0.1)
near("수정안 체류 보수(분)", num(pick(b, "G7").value, /체류 보수 ([\d.]+)분/), 6.5, 0.1)
near("원본 링크 마진(dB)", num(pick(a, "G8").value, /마진 (-?[\d.]+) dB/), -4.2, 0.1)
near("수정안 링크 마진(dB)", num(pick(b, "G8").value, /마진 (-?[\d.]+) dB/), 5.2, 0.1)
near("수정안 가능 반경(km)", b.envelopeKm ?? 0, 2.54, 0.02)
near("원본 FAIL 수(G0~G8)", a.fail, 8, 0)
near("수정안 FAIL 수(G0~G8)", b.fail, 2, 0)
console.log(`${fail ? "FAIL" : "PASS"} ${fail ? fail + "건 실패" : "전부 통과"}`); process.exit(fail ? 1 : 0)
