#!/usr/bin/env python3
"""배포 릴리스 노트 생성기(2026-10-23): 이번 배포에 무엇이 들어갔는지 커밋 제목으로 보여 준다.
Vercel 배포 목록에는 설명이 없으므로 (1) 배포 때 --meta로 요약을 붙이고 (2) git 태그(deploy-*)에 노트를 남기고 (3) docs/RELEASES.md에 쌓는다.
사용:
  python3 scripts/release-notes.py                 # 마지막 deploy-* 태그 이후 변경을 출력
  python3 scripts/release-notes.py --meta          # Vercel 메타용 한 줄 요약(200자 이내)
  python3 scripts/release-notes.py --write TAG     # docs/RELEASES.md 맨 위에 TAG 항목 추가
  python3 scripts/release-notes.py --backfill REF  # REF 이후 전체 이력을 한 번에 정리(최초 1회)
"""
import re, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = [("feat", "기능 추가"), ("fix", "수정"), ("tune", "조정"), ("refactor", "구조 변경"), ("wiki", "자료·지식 반영"), ("ops", "운영"), ("docs", "문서"), ("build", "빌드"), ("chore", "기타"), ("UI", "화면")]
def sh(*a):
    return subprocess.run(a, cwd=ROOT, capture_output=True, text=True).stdout.strip()
def last_tag():
    t = sh("git", "describe", "--tags", "--match", "deploy-*", "--abbrev=0")
    return t or None
def commits(since):
    rng = f"{since}..HEAD" if since else "HEAD~15..HEAD"
    out = sh("git", "log", rng, "--pretty=%h|%ad|%s", "--date=format:%m-%d")
    rows = []
    for l in out.splitlines():
        h, d, s = l.split("|", 2)
        m = re.match(r"([A-Za-z]+)(?:\s[a-z]+)?(?:\([^)]*\))?(?:\([^)]*\))?:\s*(.*)", s)
        key, text = (m.group(1), m.group(2)) if m else ("chore", s)
        label = next((lab for k, lab in CAT if k.lower() == key.lower()), "기타")
        rows.append((label, h, d, text.strip()))
    return rows
def render(rows, title):
    out = [f"## {title}", ""]
    for label in dict.fromkeys(r[0] for r in rows):
        out.append(f"**{label}**")
        out += [f"- {r[3]} (`{r[1]}`, {r[2]})" for r in rows if r[0] == label]
        out.append("")
    return "\n".join(out)
def meta(rows):
    parts = []
    for label in dict.fromkeys(r[0] for r in rows):
        n = sum(1 for r in rows if r[0] == label); first = next(r[3] for r in rows if r[0] == label)
        parts.append(f"[{label} {n}] {first[:40]}")
    s = " / ".join(parts)
    return s[:200]
if __name__ == "__main__":
    a = sys.argv[1:]
    if "--backfill" in a:
        since = a[a.index("--backfill") + 1]
        rows = commits(since)
        body = render(rows, f"배포 이력 정리(최초 작성): {since} 이후 {len(rows)}개 변경")
        p = os.path.join(ROOT, "docs", "RELEASES.md")
        open(p, "w", encoding="utf-8").write("# 릴리스 노트\n\n배포마다 무엇이 바뀌었는지 기록한다. 최신이 위. Vercel 배포 목록에는 `--meta`로 같은 요약이 붙는다.\n\n" + body + "\n")
        print(f"{len(rows)}건 정리 → docs/RELEASES.md")
        sys.exit(0)
    rows = commits(last_tag())
    if not rows: print("(변경 없음)"); sys.exit(0)
    if "--meta" in a: print(meta(rows)); sys.exit(0)
    if "--write" in a:
        tag = a[a.index("--write") + 1]
        p = os.path.join(ROOT, "docs", "RELEASES.md")
        old = open(p, encoding="utf-8").read() if os.path.exists(p) else "# 릴리스 노트\n\n"
        head, _, rest = old.partition("\n\n")
        head2, _, rest2 = rest.partition("\n\n")
        new = old.split("\n\n", 2)
        entry = render(rows, f"{tag} ({len(rows)}개 변경)")
        marker = "## "
        i = old.find(marker)
        out = old[:i] + entry + "\n" + old[i:] if i >= 0 else old + entry + "\n"
        open(p, "w", encoding="utf-8").write(out); print(f"{tag} 기록"); sys.exit(0)
    print(render(rows, "이번 배포에 들어가는 변경"))
