# 출시 준비: 라이선스와 코드 서명

ddugit은 **개인·오픈소스 무료, 회사 업무용 유료**(영구 라이선스, 1년 업데이트)다. 로그인 없이 쓰고, 라이선스는 앱이 **오프라인으로** 확인한다(폐쇄망 가능). 판매는 Lemon Squeezy, 코드 서명은 개인 이름으로 한다(2026-10-02 결정).

## 1. 라이선스

### 구조

- 라이선스 텍스트: `DDUGIT1.<payload>.<signature>` (base64url)
  - payload: `{ id, name, email, kind: "commercial" | "site", seats, issued, updatesUntil }`
  - signature: payload 바이트에 대한 Ed25519 서명
- 앱에는 **공개키만** 들어간다(`src-tauri/src/license.rs`, 빌드할 때 `DDUGIT_LICENSE_PUBKEY`). 그래서 서버·계정 없이 확인되고, 폐쇄망에서도 똑같이 동작한다.
- `updatesUntil`까지 나온 버전은 계속 쓸 수 있다. 그 뒤에 나온 버전이면 설정에 갱신 안내만 띄운다. 기능은 막지 않는다(신뢰 기반).
- 라이선스는 앱 설정 폴더의 `license.txt`에 저장한다(webview 저장소가 아님).

### 발급 키 만들기 (한 번, 내 컴퓨터에서)

```bash
node scripts/license.mjs keygen ~/secure/ddugit-license-private.pem
# → DDUGIT_LICENSE_PUBKEY=xxxx 가 출력된다
```

1. 출력된 공개키를 GitHub 저장소 **Settings → Secrets and variables → Actions → Variables**에 `DDUGIT_LICENSE_PUBKEY`로 넣는다. 공개 값이라 Secret이 아니라 Variable로 넣는다. 그 뒤로 Release 빌드는 라이선스를 확인할 수 있다.
2. 개인키(`.pem`)는 비밀번호 관리자와 오프라인 백업에 둔다. 저장소에는 절대 넣지 않는다(`.gitignore`에 `*.pem` 있음).
   - 잃어버리면 새 라이선스를 발급할 수 없다.
   - 새어 나가면 누구나 라이선스를 만들 수 있다. 이때는 키를 새로 만들고, 새 공개키로 빌드하고, 기존 고객에게 재발급한다.

### 수동 발급 (초기, 주문이 적을 때)

```bash
node scripts/license.mjs sign --key ~/secure/ddugit-license-private.pem \
  --name "Acme Corp" --email it@acme.example --kind commercial --seats 5 --until 2027-10-02
node scripts/license.mjs verify --pub <공개키> "<라이선스 텍스트>"   # 앱과 같은 방식으로 확인
```

출력된 텍스트를 메일로 보내면 된다. 고객은 앱 **설정 → 라이선스**에 붙여 넣는다.

### Lemon Squeezy 자동 발급 (주문이 늘면)

1. 상품
   - "ddugit 상업용"(좌석 수 = 수량)
   - "ddugit 사이트 라이선스"(기관 전체, 폐쇄망 고객용, `kind: "site"`)
2. Webhook `order_created` → 작은 서버리스 함수(예: Cloudflare Worker)를 둔다
   - `X-Signature` 헤더(HMAC-SHA256, Lemon Squeezy signing secret)를 검증한다
   - 주문에서 이름·메일·수량을 읽어 `scripts/license.mjs`의 `licenseText`와 같은 payload를 만든다
   - Ed25519로 서명한다. Workers는 Web Crypto `Ed25519`를 지원하고, 개인키는 Worker secret에 둔다
   - 고객에게 메일로 보낸다(예: Resend). 또는 구매 완료 페이지에서 주문 번호로 조회하게 한다
3. 앱의 구매 버튼은 `src/components/License.tsx`의 `BUY_URL`에 스토어 주소를 넣으면 나타난다.

## 배포 위치 (2026-10-04 결정)

- 오픈소스가 아니다(LICENSE 없음, 모든 권리 보유). 저장소는 비공개로 돌린다.
- 무료·유료 모두 **GitHub Release로 배포하지 않는다.** 별도 사이트와 별도 파일 저장소(dmg·exe)를 쓴다.
- ~~`release.yml`이 만드는 Release 초안은 내부 보관용이다.~~ → `release.yml`은 GitHub Release를 만들지 않는다(2026-10-04, v0.6.0 초안 만들기가 403으로 실패한 뒤 결정). 설치 파일은 Supabase Storage에 올리고, 모든 실행에서 Actions artifact로도 남긴다. 그래서 버전 태그도 생기지 않는다(필요하면 태그를 직접 push한다).
- 비공개 저장소의 Actions는 월 무료 분량 안에서 돈다(macOS ×10, Windows ×2). Billing의 지출 한도를 0으로 두면 넘어도 청구되지 않고 멈춘다.

## 설치 파일 저장소 (Supabase Storage)

릴리스(태그 push 또는 `main`에서 `release` 체크한 수동 실행)마다 `release.yml`이 설치 파일을 올린다. 설정이 없으면 이 단계는 건너뛴다. 설치 파일은 실행마다 Actions artifact(`ddugit-macos-latest`, `ddugit-windows-latest`)로도 남는다.

- `releases/v<버전>/ddugit_<버전>_universal.dmg`, `releases/v<버전>/ddugit_<버전>_x64-setup.exe`
- `releases/downloads.json`: 지금 버전과 파일 주소·크기. 다운로드 페이지가 읽는다(`scripts/downloads.mjs`가 만든다)
- 공개 주소: `https://<프로젝트 ref>.supabase.co/storage/v1/object/public/releases/...`

### 설정 (한 번)

1. Supabase 대시보드 → Storage → **New bucket** `releases`, **Public bucket** 켜기. 파일 크기 제한은 50MB 이상
2. Project Settings → Storage → **S3 Connection**: 엔드포인트의 리전 확인(예: `ap-northeast-2`), **New access key**로 S3 접근 키 발급
3. GitHub 저장소 Settings → Secrets and variables → Actions
   - Secrets: `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`
   - Variables: `SUPABASE_PROJECT_REF`(대시보드 주소의 `…/project/<ref>`), `SUPABASE_REGION`

S3 접근 키는 Storage 전체를 쓸 수 있다(DB는 아님). service_role 키는 쓰지 않는다.

## 자동 업데이트

앱은 시작할 때와 6시간마다 버킷의 `latest.json`을 읽는다. 새 버전이 있으면 탭 줄 아래에 알림이 뜬다. "업데이트하고 다시 시작"을 누르면 받아서 서명을 확인하고 설치한 뒤 다시 시작한다(Windows는 설치 프로그램이 앱을 닫는다).

- 서명 키는 사용자가 만든다: `npx tauri signer generate -w ~/.tauri/ddugit.key`. 개인키와 암호는 **ddugit 저장소** Secrets `TAURI_SIGNING_PRIVATE_KEY`(키 파일 내용 전체), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`에만 둔다. 공개키는 `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 있다. **개인키를 잃으면 이미 설치된 앱은 더 이상 업데이트를 받지 못한다.** 키 파일을 따로 백업한다
- 키와 Supabase 설정이 모두 있으면 릴리스가 업데이트 파일(macOS `ddugit.app.tar.gz`, Windows 설치 파일)과 서명(`.sig`)을 버킷에 올리고 `latest.json`을 쓴다. 앱에 확인 주소(`DDUGIT_UPDATE_URL`)도 그때만 넣는다
- `requireSignedVersion`: `latest.json`이 알리는 버전과 서명에 들어 있는 버전이 다르면 받지 않는다. `latest.json`이 위조돼도 예전 버전으로 되돌릴 수 없다
- 업데이트 기능이 처음 들어간 버전부터 다음 버전으로 업데이트할 수 있다. 그 전 버전 사용자는 사이트에서 한 번 새로 받아야 한다

무료 플랜은 월 다운로드 트래픽이 제한된다. 설치 파일이 약 8MB라 다운로드가 수백 회를 넘기면 Pro 플랜으로 올린다.

## 2. 코드 서명 (개인 이름)

서명용 시크릿이 저장소에 있으면 `release.yml`이 **알아서 서명**한다. 없으면 지금처럼 서명 없이 빌드한다.

### macOS: Developer ID + 공증

1. [Apple Developer Program](https://developer.apple.com/programs/)에 **개인(Individual)**으로 가입한다(연 99달러). 설치 창에는 개인 이름이 보인다.
2. Xcode나 developer.apple.com에서 **Developer ID Application** 인증서를 만들고, 키체인에서 `.p12`로 내보낸다(암호 설정).
3. appleid.apple.com에서 **앱 암호**를 만든다(공증용).
4. GitHub Actions **Secrets**:

| Secret                       | 값                                        |
| ---------------------------- | ----------------------------------------- |
| `APPLE_CERTIFICATE`          | `base64 -i cert.p12` 결과                 |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 암호                               |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: 이름 (TEAMID)` |
| `APPLE_ID`                   | Apple 계정 메일                           |
| `APPLE_PASSWORD`             | 앱 암호                                   |
| `APPLE_TEAM_ID`              | 팀 ID(10자)                               |

Tauri가 서명과 공증(notarytool)을 함께 한다. 그러면 첫 실행 때 Gatekeeper 경고가 사라진다.

`release.yml`은 빌드 전에 `.p12`를 OpenSSL로 열어 본다. 암호가 틀렸거나 값이 잘렸거나, 서명 이름이 인증서 이름과 다르면 어느 Secret인지 오류로 알려 준다. 그다음 macOS `security`가 읽는 형식(SHA-1 MAC·3DES)으로 다시 묶는다. OpenSSL 3 기본 형식은 암호가 맞아도 `MAC verification failed (wrong password?)`로 실패하기 때문이다(2026-10-04 첫 서명 빌드에서 겪음). 빌드가 끝나면 dmg를 열어 안의 앱을 `codesign`·`spctl`·`stapler`로 확인한다.

#### Mac 없이 인증서 만들기 (openssl)

Xcode·키체인 없이도 된다. 개인키는 내 컴퓨터에서만 만들고 저장소·채팅에 올리지 않는다.

```bash
# 1) 개인키와 인증서 요청(CSR)
openssl genrsa -out devid.key 2048
openssl req -new -key devid.key -out devid.csr -subj "/emailAddress=<Apple 계정 메일>/CN=<이름>/C=KR"
# 2) developer.apple.com → Certificates → + → "Developer ID Application" (G2 Sub-CA) → devid.csr 올리기 → developerID_application.cer 받기
# 3) .p12로 묶기 (암호를 정한다. 이 암호가 APPLE_CERTIFICATE_PASSWORD)
openssl x509 -inform DER -in developerID_application.cer -out devid.pem
openssl pkcs12 -export -legacy -inkey devid.key -in devid.pem -out devid.p12
# 4) GitHub Secret 값
base64 -i devid.p12 | tr -d '\n'      # → APPLE_CERTIFICATE (Linux: base64 -w0 devid.p12)
openssl x509 -in devid.pem -noout -subject   # CN이 APPLE_SIGNING_IDENTITY ("Developer ID Application: 이름 (TEAMID)")
```

- `-legacy`: OpenSSL 3의 기본 암호화는 macOS `security`가 못 읽는 경우가 있어 예전 방식으로 묶는다(OpenSSL 1.x면 빼도 된다).
- 팀 ID는 developer.apple.com → Membership details에 있다.
- `devid.key`·`devid.p12`는 비밀번호 관리자에 보관하고 지운다. Developer ID 인증서는 5년 유효, 개인 계정은 동시에 몇 개까지만 만들 수 있다.

#### 확인

시크릿을 넣은 뒤 Release를 수동 실행하면 macOS 잡에 "macOS signing and notarization" 단계가 돈다. 받은 `.dmg`를 다른 Mac에서 열었을 때 "확인되지 않은 개발자" 경고 없이 열리면 된다. 터미널로는 `spctl -a -vv -t install ddugit.app`(source=Notarized Developer ID)와 `xcrun stapler validate ddugit_x.y.z_universal.dmg`.

### Windows

2023년 6월부터 코드 서명 키는 하드웨어 보안 모듈(HSM)이나 클라우드 서명에만 둘 수 있다. 개인 이름으로 받을 수 있는 경로는 이렇다(발급 조건과 가격은 신청 전에 각 회사에 확인한다).

- **Certum** 개인 코드 서명 인증서 + SimplySign(클라우드)
- **SSL.com** 개인(IV) 코드 서명 + eSigner(클라우드, `CodeSignTool`)
- **Azure Trusted Signing**: 개인 가입이 가능한 국가가 제한적이다. 한국 거주자가 쓸 수 있는지 확인이 필요하다.

인증서를 받으면 서명 명령을 `WINDOWS_SIGN_COMMAND` 시크릿에 넣는다. 파일 자리는 `%1`로 쓴다. 예:

```
CodeSignTool.bat sign -username=... -password=... -credential_id=... -totp_secret=... -input_file_path=%1 -override
```

서명 도구를 설치하는 단계(다운로드·압축 해제)는 제공사마다 달라서, 인증서를 고른 뒤 `release.yml`의 "Windows signing" 앞에 추가한다.

SmartScreen 경고는 서명해도 처음에는 나올 수 있다. 다운로드 평판이 쌓이면 사라진다.

### 서명한 뒤

`release.yml`의 `releaseBody`에 적힌 "Unsigned build…" 안내를 지운다.
