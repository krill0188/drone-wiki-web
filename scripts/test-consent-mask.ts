// 마스킹·동의·경험 로그 행 생성 시험(저장소 없이 순수 함수만).
import { maskText } from "../lib/mask"
import { consentMode, hasConsent, CONSENT_VERSION } from "../lib/consent"
import { buildTurnRow } from "../lib/exp-log"
let fail = 0
const must = (n: string, ok: boolean) => { if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n) }
must("이메일 마스킹", maskText("문의는 master@example.com 로") === "문의는 [이메일] 로")
must("휴대전화 마스킹", !/010[-\s]?\d{4}[-\s]?\d{4}/.test(maskText("내 번호 010-1234-5678 입니다")))
must("일반 전화 마스킹", maskText("02-123-4567로").includes("[전화번호]"))
must("주민번호 형태 마스킹", maskText("900101-1234567").includes("[주민번호]"))
must("API 키 마스킹(nvapi-/sk-)", !maskText("키 nvapi-abcdefghijklmnopqrstuvwxyz1234 와 sk-abcdefghijklmnopqrstuvwxyz").match(/nvapi-abc|sk-abc/))
must("URL 쿼리 토큰 마스킹", maskText("https://x.com/a?token=SECRET123&b=1").includes("token=[비밀값]&b=1"))
must("긴 해시 마스킹", maskText("deadbeef".repeat(5)).includes("[긴 해시/키]"))
must("정상 질문은 그대로", maskText("PX4와 ArduPilot의 차이점은?") === "PX4와 ArduPilot의 차이점은?")
must("길이 제한", maskText("가".repeat(5000), 100).length <= 101)
must("드론 수치(1.5m, 20분)는 마스킹하지 않는다", maskText("페이로드 10kg, 비행거리 5km, 크기 1.5m, 비행시간 20분") === "페이로드 10kg, 비행거리 5km, 크기 1.5m, 비행시간 20분")
must("모드 기본값은 strict", consentMode({}) === "strict" && consentMode({ CONSENT_MODE: "optional" }) === "optional" && consentMode({ CONSENT_MODE: "off" }) === "off" && consentMode({ CONSENT_MODE: "xx" }) === "strict")
const ck = (v?: string) => ({ get: (n: string) => (n === "dw_consent" && v ? { value: v } : undefined) })
must("동의 쿠키는 버전이 같을 때만 유효", hasConsent(ck(CONSENT_VERSION)) && !hasConsent(ck("2020-01-01")) && !hasConsent(ck()))
const row = buildTurnRow({ sid: "s1", feature: "chat", question: "내 메일 a@b.co 로 보내줘 PX4 설정", status: "insufficient_evidence", isTest: true, docSlugs: Array(30).fill("x"), classes: Array(30).fill("c") })
must("행: 질문 마스킹·테스트 표시·길이 제한", row.question.includes("[이메일]") && row.is_test === true && row.doc_slugs.length === 12 && row.classes.length === 8 && row.consent_version === CONSENT_VERSION)
must("행에 답변 전문 필드가 없다", !("answer" in row))
console.log(fail ? `FAIL ${fail}건` : "PASS 전부 통과"); process.exit(fail ? 1 : 0)
