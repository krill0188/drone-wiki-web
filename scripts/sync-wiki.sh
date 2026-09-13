#!/usr/bin/env bash
# Stage 0-R: audit only until explicit release approval. No snapshot/Git/deploy writes.
# The version-controlled policy and preflight live with the knowledge source of truth.
set -euo pipefail
if [[ $# -gt 0 && "$1" != "--dry-run" && "$1" != "--audit" ]]; then
  echo "Only --dry-run/--audit supported; publication/deployment approval required" >&2
  exit 2
fi
python3 "$HOME/2nd/scripts/publication-preflight.py"
echo "Audit complete; Generate ordering and release approval still required. No sync or deploy executed."
