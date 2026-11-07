// 뉴스 메뉴 필터·건수 헬퍼 검사 (2026-11-07): domain 또는 topics 로 속하고, 건수가 발행마다 계산되며, PKM 은 메뉴에서 빠진다.
import { inDomain, domainCounts, NEWS_HIDDEN_DOMAINS } from "../lib/news"
import { DOMAIN_META } from "../lib/types"

let failed = 0
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "OK  " : "FAIL"} ${msg}`); if (!ok) failed++ }

const items = [
  { domain: "hardware", topics: ["vendor-registry"] },
  { domain: "hardware", topics: ["security", "rf-datalink-engineering"] },
  { domain: "ops-mission" },
  { domain: "ai-autonomy", topics: [] },
] as { domain: any; topics?: string[] }[]

check(inDomain(items[0], "hardware") && inDomain(items[0], "vendor-registry"), "domain 과 topics 둘 다로 속한다")
check(!inDomain(items[2], "security"), "topics 가 없는 옛 항목은 새 분류에 속하지 않는다(오류 없음)")
const keys = Object.keys(DOMAIN_META)
const c = domainCounts(items, keys)
check(c["hardware"] === 2 && c["vendor-registry"] === 1 && c["security"] === 1 && c["ai-autonomy"] === 1, "분류별 건수가 정확하다")
check(c["navigation-gnss-denied"] === 0, "항목이 없는 분류는 0 으로 센다")
check(!("knowledge-management" in c) && NEWS_HIDDEN_DOMAINS.includes("knowledge-management"), "지식관리(PKM)는 메뉴 건수에서 제외된다")
check(keys.every((k) => DOMAIN_META[k].label.length > 0), "모든 메뉴 키에 라벨이 있다")
process.exit(failed ? 1 : 0)
