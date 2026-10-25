# 구글 로그인 켜기 (마스터 작업 순서)

코드는 배포돼 있고 `NEXT_PUBLIC_AUTH_ENABLED`가 꺼져 있어 로그인 버튼이 숨겨져 있다. 아래 두 곳을 설정한 뒤 켠다. 비밀값(Client Secret)은 이 저장소·채팅에 적지 않는다.

## 1. Google Cloud (OAuth 클라이언트 만들기)
1. https://console.cloud.google.com 에서 프로젝트 선택(또는 새로 만들기, 예: `dronewiki`).
2. **API 및 서비스 → OAuth 동의 화면**: 사용자 유형 **외부**, 앱 이름 `DroneWiki`, 지원 이메일 입력. 범위는 기본(`openid`, `email`, `profile`)만 — 민감 범위가 없어 심사가 필요 없다. 게시 상태를 **프로덕션으로 이동**(테스트 상태면 등록한 테스트 사용자만 로그인된다).
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://ghfeujishcjlcqytvhrl.supabase.co/auth/v1/callback`
4. 만들어진 **클라이언트 ID**와 **클라이언트 보안 비밀**을 복사해 둔다.

## 2. Supabase (제공자 켜기)
대시보드 https://supabase.com/dashboard/project/ghfeujishcjlcqytvhrl 
1. **Authentication → Sign In / Providers → Google**: Enable, 위에서 복사한 Client ID·Secret 붙여넣고 저장.
2. **Authentication → URL Configuration**:
   - Site URL: `https://drone-wiki-web.vercel.app`
   - Redirect URLs: `https://drone-wiki-web.vercel.app/**` (개발용이면 `http://localhost:3000/**`도)

## 3. 켜기 (Claude가 함)
- Vercel 환경변수 `NEXT_PUBLIC_AUTH_ENABLED=1` 등록 후 재배포 → 사이드바에 "구글로 로그인", `/my`(내 기록)가 나타난다.

## 동작 요약
- 로그인은 선택이다. 로그인해도 수집 동의(질문하기·설계 도우미)는 따로 받는다.
- 로그인한 사용자의 질문·설계·진행 중 설계가 계정에 묶여 기기 간에 이어진다. `/my`에서 보고 지우고 계정을 삭제할 수 있다.
- `OWNER_EMAILS`(기본 `krill0188@gmail.com`) 계정은 자동으로 '테스트'로 표시돼 집계에서 빠진다.
