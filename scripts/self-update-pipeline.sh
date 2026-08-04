#!/bin/bash
# 자가 갱신 파이프라인 실행 래퍼 — scripts/self-update-pipeline.ts 참고.
# extract-knowledge-graph.sh와 동일한 패턴(cron/수동 둘 다에서 쓸 수 있는 얇은 래퍼).
set -e
cd "$(dirname "$0")/.."
npx tsx scripts/self-update-pipeline.ts "$@"
