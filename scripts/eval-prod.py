#!/usr/bin/env python3
"""운영 /api/chat 25문항 평가(배포 후 회귀 확인용): 시간, 근거 유형, 상태, 거절 여부, 금지어, 검증 경고.
사용: python3 scripts/eval-prod.py [--url URL] [--tier fast|deep] [--out file.json]
종료 코드: 정답 22/25 미만 또는 p90 40초 초과면 1."""
import json, sys, time, urllib.request, concurrent.futures as cf, re

ARGS = sys.argv[1:]
opt = lambda k, d=None: ARGS[ARGS.index(k) + 1] if k in ARGS else d
HDR = {"content-type": "application/json", "cookie": "dw_consent=2026-10-25; dw_sid=eval-script; dw_test=1", "x-dw-test": "1"}
URL = opt("--url", "https://drone-wiki-web.vercel.app") + "/api/chat"
TIER = opt("--tier", "auto")  # auto = 환경 기본 판정 + 캐시 우회(측정용)
# (질문, 기대: ans=답변해야 함 / ref=거절해야 함, 반드시 포함할 단어들(하나라도), 금지 단어)
Q = [
 ("u-blox ZED-X20P 사양은?", "ans", ["채널", "RTK", "GNSS"], []),
 ("Septentrio mosaic-G5 P3 채널 수와 전력은?", "ans", ["789"], []),
 ("Jetson Orin Nano에서 NanoSAM 지연은?", "ans", ["27"], []),
 ("RTK와 PPK의 차이를 자세히 설명해줘", "ans", ["RTK", "PPK"], []),
 ("ArduPilot 설치 방법을 단계별로 알려줘", "ans", ["ArduPilot"], []),
 ("GNSS 재밍 대응 방법을 정리해줘", "ans", ["재밍"], []),
 ("LiPo 배터리 보관 방법은 뭐예요", "ans", ["LiPo", "배터리"], []),
 ("PX4 EKF2 지연 기본값은?", "ans", ["EKF2"], []),
 ("MAVLink가 뭐야?", "ans", ["MAVLink"], []),
 ("YOLO26을 Jetson Orin에서 돌리면 어때?", "ans", ["Orin", "YOLO"], []),
 ("카메라와 IMU 시간 동기는 왜 필요해?", "ans", ["동기"], []),
 ("국토지리정보원 네트워크 RTK 접속 서버 주소는?", "ans", ["ngii", "NGII", "RTS"], []),
 ("ARP6983 상태는?", "ans", ["ARP6983"], []),
 ("드론 비행 승인 면제 기준은?", "ans", ["kg", "승인", "면제"], []),
 ("2kg 이하 드론도 신고해야 해?", "ans", ["신고"], []),
 ("DJI는 어떤 회사야?", "ans", ["DJI"], []),
 ("Gemfan 프로펠러 규격은?", "ans", ["프로펠러", "Gemfan"], []),
 ("GNSS 스푸핑 탐지 방법은?", "ans", ["스푸핑"], []),
 ("RTK 안테나 설치 위치 주의점은?", "ans", ["안테나"], []),
 ("연합학습 UAV 보안 위협은?", "ans", ["연합학습", "공격", "보안"], []),
 ("양자컴퓨터 드론 항법은?", "ref", [], []),
 ("P-73 규정 요약해줘", "ref", [], []),
 ("오늘 서울 날씨 알려줘", "ref", [], []),
 ("CHCNAV M720 사양은", "ans", ["CHCNAV", "M720"], []),
 ("SIYI RTK 모듈 사양 알려줘", "ans", ["SIYI"], []),
]
BAD = ["미확인"]

def ask(q):
    t0 = time.time()
    payload = {"messages": [{"id": "1", "role": "user", "parts": [{"type": "text", "text": q}]}]}
    if TIER: payload["modelTier"] = TIER
    body = json.dumps(payload).encode()
    # 운영 점검은 수집 동의 쿠키와 테스트 표시를 달아 보낸다(집계에서 제외, 동의 고지 버전은 lib/consent.ts와 같아야 한다)
    req = urllib.request.Request(URL, body, HDR)
    text, meta = "", {}
    first = None
    try:
        with urllib.request.urlopen(req, timeout=170) as r:
            for raw in r:
                l = raw.decode("utf-8", "ignore").strip()
                if not l.startswith("data: {"): continue
                try: d = json.loads(l[6:])
                except Exception: continue
                if d.get("type") == "text-delta":
                    if first is None: first = time.time() - t0
                    text += d.get("delta", "")
                elif d.get("type") == "finish":
                    meta = d.get("messageMetadata") or {}
    except Exception as e:
        return dict(q=q, err=str(e)[:80], t=time.time() - t0)
    return dict(q=q, t=round(time.time() - t0, 1), first=round(first or 0, 1), text=text, meta=meta.get("answerMeta") or {})

res = []
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    futs = {ex.submit(ask, q[0]): q for q in Q}
    for f in cf.as_completed(futs):
        q = futs[f]; r = f.result(); r["exp"] = q[1]; r["must"] = q[2]; res.append(r)
order = {q[0]: i for i, q in enumerate(Q)}
res.sort(key=lambda r: order[r["q"]])
ok = 0; times = []
for r in res:
    if "err" in r:
        print("ERR ", r["q"], r["err"]); continue
    refused = r["meta"].get("status") == "insufficient_evidence" or bool(re.match(r"\s*이 질문은 .{0,40}(답할 근거를 찾지|답변하지 않)", r["text"]))
    hit = (not r["must"]) or any(w.lower() in r["text"].lower() for w in r["must"])
    bad = [b for b in BAD if b in r["text"]]
    good = (refused if r["exp"] == "ref" else (not refused and hit)) and not bad
    ok += good; times.append(r["t"])
    m = r["meta"]
    print(("OK  " if good else "FAIL"), f'{r["t"]:5.1f}s first {r["first"]:4.1f}s', (m.get("basis") or "-"), (m.get("status") or "-"), "|", r["q"], ("| BAD:" + ",".join(bad)) if bad else "", "| infer" if "🔮" in r["text"] else "")
times.sort()
print(f"\n정답 {ok}/{len(Q)}  p50 {times[len(times)//2]}s  p90 {times[int(len(times)*0.9)-1]}s  max {times[-1]}s")
json.dump(res, open(opt("--out", "eval-prod-result.json"), "w"), ensure_ascii=False)
warn = sum(1 for r in res if (r.get("meta") or {}).get("status") == "unverified")
print(f"검증 경고 {warn}건")
sys.exit(0 if ok >= 22 and times[int(len(times) * 0.9) - 1] <= 40 else 1)
