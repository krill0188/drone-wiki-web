#!/bin/bash
# 운영 배포 안전 스크립트(2026-10-23). 공유 폴더(다른 계정도 편집)에서의 배포와 시험 전 배포를 막는다.
# 사용: 깨끗한 git worktree에서 `bash scripts/deploy-prod.sh` — 점검 통과 후에만 `vercel --prod --yes`를 실행한다.
set -eu
fail(){ echo "배포 중단: $1" >&2; exit 1; }
GITDIR="$(git rev-parse --git-dir)"
COMMON="$(git rev-parse --git-common-dir)"
[ "$GITDIR" != "$COMMON" ] || fail "작업 복사본(git worktree)이 아니라 원본 폴더입니다. 'git worktree add'로 깨끗한 복사본을 만든 뒤 그곳에서 실행하세요."
[ -z "$(git status --porcelain)" ] || fail "커밋하지 않은 변경이 있습니다."
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "HEAD가 origin/main과 다릅니다. 푸시하거나 최신으로 맞추세요."
[ -d .vercel ] || fail ".vercel(프로젝트 연결) 폴더가 없습니다. 원본 폴더에서 복사하세요."
echo "== 타입 검사"; npx tsc --noEmit
echo "== 답변 시험"; KG_BACKEND=sqlite npx tsx scripts/test-kg-answer.ts < /dev/null | tail -3
echo "== 모델 체인 시험"; NVIDIA_NIM_API_KEY=x npx tsx scripts/test-hedge.ts < /dev/null 2>&1 | grep -E "^PASS|FAIL" | tail -2
echo "== 게이트·논문 근거 시험"; npx tsx scripts/test-gates.ts < /dev/null | tail -1; npx tsx scripts/test-gates-adapter.ts < /dev/null | tail -1; npx tsx scripts/test-paper-evidence.ts < /dev/null | tail -1; npx tsx scripts/test-sw-match.ts < /dev/null | tail -1
echo "== 지식 DB 최신 여부"; "${KDB_PY:-$HOME/2nd/.venv/bin/python}" scripts/build-knowledge-db.py --verify | tail -1
echo "== 이번 배포에 들어가는 변경"; python3 scripts/release-notes.py
NOTES="$(python3 scripts/release-notes.py --meta)"
SUBJECT="$(git log -1 --pretty=%s)"
echo "== 배포"; vercel --prod --yes -m releaseNotes="$NOTES" -m githubCommitMessage="$SUBJECT ※ 이번 배포: $NOTES" -m githubCommitSha="$(git rev-parse HEAD)"
TAG="deploy-$(date +%Y%m%d-%H%M)"
DEPLOYED="$(git rev-parse HEAD)"
FULL="$(python3 scripts/release-notes.py)"
python3 scripts/release-notes.py --write "$TAG"
git add docs/RELEASES.md && git commit -qm "docs: 릴리스 노트 $TAG" || true
git tag -a "$TAG" "$DEPLOYED" -m "$FULL"
git push -q origin HEAD:main "$TAG" && echo "릴리스 노트: docs/RELEASES.md, 태그 $TAG"
echo "== 배포 후: curl https://drone-wiki-web.vercel.app/api/health 와 npm run eval:prod 로 확인하세요."
