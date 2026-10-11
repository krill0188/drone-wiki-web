# 드론위키: Codex-LB + Hermes Agent + Telegram 설치 가이드 (1탄) — Codex-LB 설치와 ChatGPT 계정 연결

## 전체 구조

```
ChatGPT 계정 1개 이상
        ↓ OAuth
    Codex-LB
        ↓ OpenAI 호환 API
  Hermes Agent
        ↓ Telegram Gateway
  Telegram 봇
```

- Codex-LB: 여러 ChatGPT 계정 연결·분산·사용량 관리
- Hermes Agent: 터미널·파일·웹·MCP·자동화 담당
- Telegram: 휴대폰에서 Hermes를 사용하는 인터페이스

---

## 1. 사전 준비

### Windows

설치할 것:

- Docker Desktop
- Git 선택 사항
- Hermes Agent Desktop 또는 CLI

Docker Desktop 공식 사이트:

https://www.docker.com/products/docker-desktop/

Windows에서는 Docker Desktop 설치 후 다음을 활성화하는 것이 좋습니다.

```
Use WSL 2 based engine
```

### macOS

설치할 것:

- Docker Desktop
- Hermes Agent Desktop 또는 CLI

Apple Silicon Mac은 Docker Desktop의 ARM64 환경을 사용하면 됩니다.

확인:

```
uname -m
```

결과가:

```
arm64
```

이면 Apple Silicon입니다.

---

## 2. Codex-LB 설치

Codex-LB는 Docker 방식이 가장 간단하고 안전합니다.

### macOS 설치

Terminal에서 실행합니다.

```
docker volume create codex-lb-data

docker run -d \
  --name codex-lb \
  -p 2455:2455 \
  -p 1455:1455 \
  -v codex-lb-data:/var/lib/codex-lb \
  ghcr.io/soju06/codex-lb:latest
```

상태 확인:

```
docker ps
```

헬스 확인:

```
curl http://127.0.0.1:2455/health
```

정상 응답 예시:

```
{"status":"ok"}
```

대시보드:

```
http://127.0.0.1:2455
```

---

### Windows 설치

PowerShell에서 실행합니다.

```
docker volume create codex-lb-data
```

```
docker run -d `
  --name codex-lb `
  -p 2455:2455 `
  -p 1455:1455 `
  -v codex-lb-data:/var/lib/codex-lb `
  ghcr.io/soju06/codex-lb:latest
```

상태 확인:

```
docker ps
```

헬스 확인:

```
Invoke-RestMethod http://127.0.0.1:2455/health
```

대시보드:

```
http://127.0.0.1:2455
```

포트 의미:

```
2455 = Codex-LB 대시보드·API
1455 = ChatGPT OAuth 콜백
```

1455 포트는 ChatGPT 계정 연결에 필요하므로 두 포트를 모두 열어두어야 합니다.

---

## 3. Codex-LB에 ChatGPT 계정 연결

Codex-LB 대시보드에서 진행합니다.

```
http://127.0.0.1:2455
```

### 계정 추가

1. Accounts 메뉴 선택
2. Add Account 선택
3. 브라우저에서 ChatGPT 로그인
4. 권한 승인
5. Codex-LB로 돌아오기
6. 계정 상태 확인

계정이 정상적으로 등록되면 다음 정보를 확인할 수 있습니다.

```
계정 상태
사용량
사용 가능 모델
최근 요청
오류 상태
```

처음에는 ChatGPT 계정 하나만 연결해 테스트하는 것이 좋습니다.

```
계정 1개 연결
→ 요청 테스트
→ Hermes 연결
→ 이후 추가 계정 연결
```

### 계정 여러 개 연결

추가 계정은 같은 방법으로 등록합니다.

```
Accounts
→ Add Account
→ 다른 ChatGPT 계정 로그인
```

Codex-LB가 여러 계정 사이에서 요청을 분산합니다.

### 계정 데이터 저장

Docker를 사용하면 데이터는 다음 볼륨에 보존됩니다.

```
codex-lb-data:/var/lib/codex-lb
```

컨테이너를 삭제해도 Docker volume을 삭제하지 않으면 계정과 설정이 유지됩니다.

컨테이너 중지:

```
docker stop codex-lb
```

다시 시작:

```
docker start codex-lb
```

로그 확인:

```
docker logs codex-lb
```

컨테이너 삭제 시에도 볼륨은 별도로 삭제하지 마세요.

```
docker rm codex-lb
```

다음 실행으로 기존 데이터를 재사용할 수 있습니다.

---

## 4. Codex-LB API 인증 설정

Codex-LB는 기본적으로 로컬 사용을 쉽게 하기 위해 API Key 인증이 꺼져 있을 수 있습니다.

로컬 PC에서만 사용하는 경우:

```
localhost만 접근
외부 포트 공개 안 함
```

으로 먼저 테스트할 수 있습니다.

원격 PC·Telegram 서버·외부 네트워크에서 접근한다면 반드시:

```
Settings
→ API Key Auth
→ Enable
```

을 설정해야 합니다.

그 후:

```
API Keys
→ Create
```

에서 키를 생성합니다.

키는 생성 시 한 번만 보일 수 있으므로 안전한 비밀 저장소에 보관합니다.

예시 환경변수:

```
export CODEX_LB_API_KEY='***'
```

Windows PowerShell:

```
$env:CODEX_LB_API_KEY='***'
```

실제 키는 Telegram, 채팅, GitHub, .env 커밋에 넣지 않습니다.

---

## 5. Codex-LB 요청 테스트

API Key 인증이 꺼진 로컬 환경에서 기본 테스트:

```
curl http://127.0.0.1:2455/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex",
    "messages": [
      {
        "role": "user",
        "content": "Codex-LB 연결 상태를 한 문장으로 알려줘."
      }
    ]
  }'
```

인증을 켠 경우:

```
curl http://127.0.0.1:2455/v1/chat/completions \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex",
    "messages": [
      {
        "role": "user",
        "content": "Codex-LB 연결 상태를 한 문장으로 알려줘."
      }
    ]
  }'
```

정상 응답이 확인된 뒤 Hermes를 연결합니다.

> 다음 2탄에서는 Hermes Agent 설치, Codex-LB 연결, Telegram 봇 연동을 다룹니다.
