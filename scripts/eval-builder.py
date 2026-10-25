#!/usr/bin/env python3
"""설계 도우미 6단계 회귀 점검(운영): 기획안→부품→프로그램(반려→재작성)→세부 사양→구조도→코드 뼈대를 끝까지 호출해
단계별 시간·길이·검증 ❌ 수·교차 공학 점검표 유무를 기록한다. 사용: python3 scripts/eval-builder.py [--url URL] [--out file.json] [--reason on|block|off] [--save-text 1]
종료 코드 1: 6단계 중 하나가 비어 있거나(오류), 단계 하나가 240초를 넘거나, 단계별 ❌ 최대치가 3건을 넘을 때."""
import json, sys, time, urllib.request
ARGS = sys.argv[1:]
opt = lambda k, d=None: ARGS[ARGS.index(k) + 1] if k in ARGS else d
HDR = {"content-type": "application/json", "cookie": "dw_consent=2026-10-25; dw_sid=eval-script; dw_test=1", "x-dw-test": "1"}
URL = opt("--url", "https://drone-wiki-web.vercel.app") + "/api/drone-builder"
P = "농업용 방제 드론을 만들고 싶습니다. 페이로드 10kg, 비행거리 5km, 기체 크기 1.5m급 멀티로터, 비행시간 20분 이상."
STAGES = ["proposal", "hw", "sw", "techspec", "architecture", "implementation"]

def call(stage, ctx):
    t0 = time.time(); out = ""; prog = 0
    req = urllib.request.Request(URL, json.dumps({"prompt": P, "stage": stage, "context": ctx, **({"reason": opt("--reason")} if opt("--reason") else {})}).encode(), HDR)
    try:
        with urllib.request.urlopen(req, timeout=290) as r:
            for raw in r:
                l = raw.decode("utf-8", "ignore").strip()
                if not l.startswith("data: {"): continue
                try: j = json.loads(l[6:])
                except Exception: continue
                if j.get("type") == "text-delta": out += j.get("delta", "")
                elif j.get("type") == "data-progress": prog += 1
                elif j.get("type") == "error": return "", time.time() - t0, prog, j.get("errorText", "error")
    except Exception as e:
        return "", time.time() - t0, prog, str(e)[:80]
    return out, time.time() - t0, prog, ""

ctx, rows = {}, []
for st in STAGES:
    out, t, prog, err = call(st, dict(ctx))
    rows.append({"stage": st, "sec": round(t), "chars": len(out), "x": out.count("❌"), "cross": "교차 공학 점검" in out, "repaired": "서버 치환" in out, "err": err, **({"text": out} if opt("--save-text") else {}), "xlines": [l.strip()[:200] for l in out.splitlines() if "❌" in l][:8]})
    print(f'{st:15} {round(t):4}s len {len(out):5} ❌{out.count("❌")} 점검표 {"O" if "교차 공학 점검" in out else "-"} {err}', flush=True)
    if st == "sw" and out:  # 반려 → 같은 단계 재작성 흐름도 확인
        o2, t2, _, e2 = call("sw", {**ctx, "feedback": {"previous": out, "reason": "ROS 2 대신 MAVLink 중심으로 단순화"}})
        rows.append({"stage": "sw-reject", "sec": round(t2), "chars": len(o2), "x": o2.count("❌"), "cross": "교차 공학 점검" in o2, "repaired": False, "err": e2, "xlines": [l.strip()[:200] for l in o2.splitlines() if "❌" in l][:8]})
        print(f'{"sw 반려→재작성":15} {round(t2):4}s len {len(o2):5} {e2}', flush=True)
        out = o2 or out
    ctx[st] = out
    if not out: break
bad = [r for r in rows if r["chars"] < 500 or r["err"]] or []
slow = [r for r in rows if r["sec"] > 240]
xs = max(r["x"] for r in rows)  # 앞 단계 점검표의 ❌가 다음 단계 본문에 그대로 이어지므로 합계가 아닌 단계별 최댓값으로 판정
print(f"\n단계 {len(rows)}개 · ❌ 단계별 최대 {xs} · 최장 {max(r['sec'] for r in rows)}초 · 점검표 {sum(1 for r in rows if r['cross'])}단계")
for r in rows:  # 스트림 조각 경계의 낱개 서로게이트가 남아 있으면 안전하게 정리해 저장한다
    if "text" in r: r["text"] = r["text"].encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    r["xlines"] = [x.encode("utf-16", "surrogatepass").decode("utf-16", "replace") for x in r.get("xlines", [])]
json.dump(rows, open(opt("--out", "eval-builder-result.json"), "w"), ensure_ascii=False, indent=1)
ok = len(rows) >= 7 and not bad and not slow and xs <= 3
print("판정:", "통과" if ok else "실패", "" if ok else f"(비어 있음/오류 {len(bad)}, 240초 초과 {len(slow)}, ❌ {xs})")
sys.exit(0 if ok else 1)
