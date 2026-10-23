#!/bin/bash
# 정기 운영 점검: /api/health + 25문항 평가(scripts/eval-prod.py). 결과는 이력 파일에 한 줄로 쌓고, 실패하면 macOS 알림을 띄운다.
# 실행: bash scripts/ops-eval.sh [BASE_URL]   (launchd: ai.dronewiki.eval, 매일 07:40)
set -u
BASE="${1:-https://drone-wiki-web.vercel.app}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HOME/projectm/drone-wiki-ops"
mkdir -p "$OUT"
TS="$(date '+%Y-%m-%d %H:%M')"

health="$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$BASE/api/health")"
body="$(curl -s -m 30 "$BASE/api/health")"
python3 "$HERE/eval-prod.py" --url "$BASE" --out "$OUT/last-eval.json" > "$OUT/last-eval.txt" 2>&1
rc=$?

python3 - "$TS" "$health" "$rc" "$OUT" <<'PY'
import json, sys, re
ts, health, rc, out = sys.argv[1:5]
txt = open(f"{out}/last-eval.txt", encoding="utf-8").read()
m = re.search(r"정답 (\d+)/(\d+)\s+p50 ([\d.]+)s\s+p90 ([\d.]+)s\s+max ([\d.]+)s", txt)
w = re.search(r"검증 경고 (\d+)건", txt)
rec = {"at": ts, "health": int(health), "evalExit": int(rc), "score": m.group(1) if m else None, "total": m.group(2) if m else None,
       "p50": float(m.group(3)) if m else None, "p90": float(m.group(4)) if m else None, "max": float(m.group(5)) if m else None, "warn": int(w.group(1)) if w else None}
open(f"{out}/history.jsonl", "a", encoding="utf-8").write(json.dumps(rec, ensure_ascii=False) + "\n")
print(json.dumps(rec, ensure_ascii=False))
PY

if [ "$health" != "200" ] || [ "$rc" != "0" ]; then
  osascript -e "display notification \"health=$health eval=$rc (상세: $OUT/last-eval.txt)\" with title \"DroneWiki 운영 점검 실패\"" 2>/dev/null || true
  exit 1
fi
