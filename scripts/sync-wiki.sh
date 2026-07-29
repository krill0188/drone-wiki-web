#!/usr/bin/env bash
# 2nd Brain → DroneWiki 지식 동기화 스크립트
# Hermes daily-ingest 완료 후 자동 실행됨
# 수동 실행: bash ~/projectm/drone-wiki-web/scripts/sync-wiki.sh

set -euo pipefail

WIKI_SRC="$HOME/2nd"
DRONE_WEB="$HOME/projectm/drone-wiki-web"
DATA_WIKI="$DRONE_WEB/data/wiki"
LOG_PREFIX="[sync-wiki $(date '+%H:%M:%S')]"

echo "$LOG_PREFIX 시작: $WIKI_SRC → $DATA_WIKI"

if [[ ! -d "$WIKI_SRC" ]]; then
  echo "$LOG_PREFIX ERROR: ~/2nd 없음" >&2
  exit 1
fi

# 지식 레이어 동기화
for dir in concepts entities comparisons queries; do
  src="$WIKI_SRC/$dir"
  dst="$DATA_WIKI/$dir"
  if [[ -d "$src" && -n "$(ls -A "$src")" ]]; then
    mkdir -p "$dst"
    rsync -a --delete "$src/" "$dst/"
    count=$(ls -1 "$dst" | wc -l | tr -d ' ')
    echo "$LOG_PREFIX  $dir: ${count}개 동기화"
  fi
done

# 지식 그래프 동기화
GRAPH_SRC="$WIKI_SRC/.ua/knowledge-graph.json"
GRAPH_DST="$DATA_WIKI/.ua/knowledge-graph.json"
if [[ -f "$GRAPH_SRC" ]]; then
  mkdir -p "$(dirname "$GRAPH_DST")"
  cp "$GRAPH_SRC" "$GRAPH_DST"
  nodes=$(python3 -c "import json; d=json.load(open('$GRAPH_SRC')); print(len(d.get('nodes',[])))" 2>/dev/null || echo "?")
  echo "$LOG_PREFIX  knowledge-graph: ${nodes}개 노드"
fi

# 변경 여부 확인
cd "$DRONE_WEB"
if git diff --quiet && git diff --cached --quiet; then
  echo "$LOG_PREFIX 변경 없음 — 재배포 스킵"
  exit 0
fi

# 문서 총계
total=$(find "$DATA_WIKI" -name "*.md" | wc -l | tr -d ' ')
echo "$LOG_PREFIX 총 ${total}개 문서 → git push 트리거"

git add data/wiki/
git commit -m "sync: 2nd Brain → DroneWiki $(date '+%Y-%m-%d %H:%M') [${total}docs]"
git push origin main

echo "$LOG_PREFIX 완료 — Vercel 재배포 자동 트리거됨"
