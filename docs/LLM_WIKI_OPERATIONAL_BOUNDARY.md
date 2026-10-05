# LLM Wiki 운영 경계

## 목적

DroneWiki Web은 `/Users/amaster/2nd`의 source of truth를 직접 수정하지 않는다.
웹에서 생성되는 AI 결과는 초안 또는 proposal이며, canonical 반영은 별도의 검토·승인·발행 절차를 거친다.

## 허용 경로

```text
웹 입력
  → AI 초안 / proposal
  → 사람 검토
  → 2nd Brain canonical patch
  → SCHEMA lint + index/log 동기화
  → publication preflight
  → 별도 발행 승인
```

## 금지 경로

```text
웹 요청
  → raw 직접 수정
웹 요청
  → canonical 파일 직접 덮어쓰기
웹 요청
  → 공개 snapshot 자동 교체
웹 요청
  → Git push 또는 Vercel deploy
```

## 현재 코드 기준 확인

- `app/api/wiki-editor/route.ts`는 AI 문서 초안을 스트리밍할 뿐 파일을 쓰지 않는다.
- `app/api/pages/route.ts`와 `app/api/pages/[slug]/route.ts`는 페이지 조회 API다.
- self-update 및 discovery 승격은 별도 로컬 운영 경로이며 publication gate를 우회하지 않는다.
- source-of-truth와 공개 snapshot 동기화는 2nd Brain의 publication preflight 정책을 따른다.

## 릴리즈 원칙

- 기존 사용자 변경이 있는 작업 트리는 자동 정리하거나 reset하지 않는다.
- 기능 변경은 별도 worktree/브랜치에서 검증한다.
- 이 문서는 운영 경계를 설명하며 자동 발행을 활성화하지 않는다.
