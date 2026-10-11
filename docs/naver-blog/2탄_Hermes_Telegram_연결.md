# 드론위키: Codex-LB + Hermes Agent + Telegram 설치 가이드 (2탄) — Hermes 설치, Codex-LB 연결, Telegram 봇 연동

> 1탄에서 Codex-LB 설치와 ChatGPT 계정 연결, 요청 테스트까지 마쳤다는 전제입니다.

---

## 6. Hermes Agent 설치

### macOS

#### Desktop 설치

1. Hermes 공식 사이트 접속

```
https://hermes-agent.nousresearch.com/
```

2. macOS용 DMG 다운로드
3. Hermes.app을 Applications로 이동
4. Hermes 실행

#### CLI 설치

```
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

확인:

```
hermes --version
```

진단:

```
hermes doctor
```

### Windows

#### Desktop 설치

1. Hermes 공식 사이트에서 Windows용 .appinstaller 다운로드
2. Windows App Installer로 실행
3. Hermes 설치
4. 앱 실행

#### CLI 설치

PowerShell:

```
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

확인:

```
hermes --version
```

진단:

```
hermes doctor
```

---

## 7. Hermes를 Codex-LB에 연결

Hermes는 Codex-LB의 OpenAI 호환 /v1 endpoint를 사용합니다.

```
http://127.0.0.1:2455/v1
```

Hermes의 custom provider에 다음 정보를 설정합니다.

```yaml
custom_providers:
  - name: codex-lb
    base_url: http://127.0.0.1:2455/v1
    api_mode: codex_responses
```

API Key 인증을 켠 경우에는 키 환경변수도 연결합니다.

```yaml
custom_providers:
  - name: codex-lb
    base_url: http://127.0.0.1:2455/v1
    key_env: CODEX_LB_API_KEY
    api_mode: codex_responses
```

Hermes 설정 파일을 직접 편집해야 하는 경우에는:

macOS:

```
~/.hermes/config.yaml
```

Windows:

```
%USERPROFILE%\.hermes\config.yaml
```

단, 기존 Hermes 설정을 덮어쓰지 않도록 백업 후 추가해야 합니다.

macOS/Linux:

```
cp ~/.hermes/config.yaml ~/.hermes/config.yaml.backup
```

Windows PowerShell:

```
Copy-Item `
  "$env:USERPROFILE\.hermes\config.yaml" `
  "$env:USERPROFILE\.hermes\config.yaml.backup"
```

그 후 모델 선택:

```
hermes model
```

또는 Hermes Desktop의 모델 설정에서 codex-lb provider를 선택합니다.

연결 테스트:

```
hermes chat -q "Codex-LB를 통해 연결되었는지 확인해줘."
```

상태 확인:

```
hermes status
hermes doctor
```

### Hermes 연결 시 주의

Codex-LB에는 두 endpoint가 있습니다.

```
Codex CLI·Codex IDE:
http://127.0.0.1:2455/backend-api/codex

Hermes Agent:
http://127.0.0.1:2455/v1
```

Hermes에는 /backend-api/codex가 아니라 다음을 사용합니다.

```
http://127.0.0.1:2455/v1
```

Hermes에서는 codex_responses 모드를 사용해야 멀티턴 추론 상태가 보존됩니다.

---

## 8. Telegram 봇 생성

Telegram에서 공식 계정:

```
@BotFather
```

를 엽니다.

### 봇 생성

```
/newbot
```

이후:

1. 봇 표시 이름 입력
2. 봇 username 입력
3. username은 bot으로 끝나야 함
4. BotFather가 토큰 발급

토큰 형식:

```
123456789:ABCxxxxxxxxxxxxxxxx
```

토큰은 비밀번호와 같습니다.

절대 다음 장소에 넣지 않습니다.

```
채팅
GitHub
스크린샷
공개 문서
소스코드
```

### 명령 메뉴 설정

BotFather에서:

```
/setcommands
```

예시:

```
help - 도움말
status - Hermes 상태 확인
new - 새 대화
stop - 현재 작업 중지
```

초기에는 주문이나 배포 명령을 만들지 않는 것이 좋습니다.

---

## 9. Hermes와 Telegram 연결

### Desktop/Dashboard 방식

1. Hermes Desktop 또는 Dashboard 실행
2. Messaging
3. Telegram
4. Create with QR 또는 Telegram 연결 선택
5. Telegram에서 봇 시작
6. 사용자 승인
7. 연결 상태 확인

### 수동 방식

Hermes profile의 .env 파일에 설정합니다.

macOS:

```
~/.hermes/.env
```

Windows:

```
%USERPROFILE%\.hermes\.env
```

예시:

```
TELEGRAM_BOT_TOKEN=[REDACTED]
TELEGRAM_ALLOWED_USERS=[본인 Telegram 사용자 ID]
```

여러 사용자를 허용하지 말고 초기에는 본인 ID만 등록합니다.

Gateway 시작:

```
hermes gateway start
```

상태 확인:

```
hermes gateway status
```

로그 확인:

```
hermes logs
```

Windows에서도 같은 Hermes 명령을 PowerShell에서 사용할 수 있습니다.

---

## 10. Telegram 연결 확인

Telegram에서 봇에게 차례로 보냅니다.

```
/start
```

```
현재 Hermes와 Codex-LB 연결 상태를 확인해줘.
파일은 수정하지 마.
```

```
현재 작업 폴더의 파일 목록만 보여줘.
```

```
프로젝트 테스트 상태를 확인해줘.
코드는 수정하지 마.
```

정상이라면 Hermes가 다음을 수행합니다.

```
Telegram 메시지 수신
→ Hermes Agent 처리
→ Codex-LB 모델 요청
→ Hermes 응답 생성
→ Telegram 응답 전송
```

> 다음 3탄에서는 설치 완료 후 활용 예시 5가지, 권장 운영 단계, 중지·재시작 명령, 완료 확인표를 정리합니다.
