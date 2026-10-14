# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-14_

## 지금: Windows는 Microsoft Store에서 (2026-10-14 인증 통과)

- 사용자 결정(2026-10-12): 개인·사업자 없음 → 스토어로. Store가 MSIX에 서명, 스토어 설치는 SmartScreen 경고 없음. ddugit.com `.exe`는 서명 없이 보조로 남김
- 구현: `scripts/msix.mjs`(매니페스트·타일·exe 배치, runFullTrust), release.yml Windows 잡에서 `makeappx pack`(artifact에 `.msix`), `msix-check.yml`(매니페스트 검사). 스토어 설치본은 `update.rs`의 `from_store`(패키지 ID, `GetCurrentPackageFullName`)로 앱 안 업데이트 끔(설정 → 정보 문구)
- 완료: Partner Center 이름 예약, Actions 변수 `MSIX_*`, 진짜 ID로 만든 `ddugit_1.4.3_x64.msix`(Release #38, artifact만), 사용자 실기 확인(`Add-AppxPackage -Register`) 문제 없음
- 스토어 인증 통과(2026-10-14, 1.4.3): https://apps.microsoft.com/detail/9MW648MCPQPQ . ddugit.com Windows 다운로드는 스토어가 주 버튼, 서명 없는 `.exe`는 보조 링크(ddugit-site#44, `site.ts`의 `MICROSOFT_STORE_URL`)
- 다음 스토어 업데이트: 릴리스마다 Windows artifact의 `.msix`를 Partner Center 새 제출로 올린다(손으로). 1.4.4는 사용자가 올릴 차례
- **판매 시작(2026-10-13)**: Paddle 판매자 검증 통과 → live 전환(Supabase Secrets·Netlify 값, 웹훅 목적지) → 실결제·앱 활성화·환불까지 사용자가 확인
- 직전: v1.4.5 릴리스(열 때 HEAD 레인에 포커스 #174). 사이트: 오프라인 코드 발급 시 환불 불가(ddugit-site#45)

## 지금: 이름을 Grapipe로 통일 (2026-10-14)

- 사용자 결정: 화면에 보이는 만든 이는 활동명 **Grapipe**(사업자 아님), 문의는 **support@grapipe.com**. 실명은 꼭 있어야 하는 곳(약관·개인정보의 한 줄, Paddle 계정)에만
- 앱: 번들 저작권 `© Grapipe`(`tauri.conf.json`). Windows 설치본의 게시자(`bundle.publisher`)는 바꾸지 않았다(NSIS 레지스트리 경로가 바뀌어 업데이트가 옛 설치를 못 찾을 수 있다). 스토어 게시자는 이미 Grapipe
- 사이트: ddugit-site#46(초안). `SITE.maker`/`SITE.legalName`, `CONTACT_EMAIL` = support@grapipe.com. **support@가 실제로 받아진 뒤에 머지**
- 메일: Cloudflare Email Routing(받기 → Gmail) + Resend 무료 SMTP(Gmail '다른 주소에서 보내기'). 사용자가 세팅 중

## 남은 일

앱 기능 마일스톤은 모두 끝났다. 전체 목록은 [ROADMAP.md](ROADMAP.md)의 '남은 마일스톤'.

### 사용자

0. grapipe.com 메일 세팅(Cloudflare 네임서버 → Email Routing → Resend 도메인 → Gmail 보내기) 후 다른 계정에서 보내고 답장해 확인 → ddugit-site#46 머지. Paddle·Partner Center의 지원 이메일도 support@로
1. Partner Center에 1.4.4 `.msix` 새 제출(Release #39의 `ddugit-windows-latest`)
2. 상품 생성에 쓴 넓은 권한의 라이브 API 키가 남아 있으면 지운다(사이트는 Customers 읽기·Adjustments 쓰기 키만 쓴다)
3. Windows 실기 점검(창 버튼·크기 조절·SmartScreen), 외부 열기·편집기·저장 창·diff/merge 도구(macOS·Windows)
4. Supabase Auth → Sessions: 최대 기간·미사용 제한(선택), Providers에서 Email·Phone·Anonymous 꺼짐 확인
5. git-scm.com GUI 목록 PR(파일은 세션에서 전달: `data/guis/ddugit.yml`, 이미지 588×332/294×166, order 61)
6. Search Console: sitemap 재제출, `/guides`·가이드 4편 색인 요청

### 나중에

- Windows 코드 서명, 레이아웃 Worker·WebGL(측정상 불필요), 라이트 모드의 결과 효과가 옅은 것
- PR 알림 구독은 새 저장소 이름 `Jimoou/ddugit`으로 한다

## 결정

- 오프라인 활성화 코드는 지금 방식 유지(기기에 묶지 않음, IntelliJ 방식)
- 비교 페이지(경쟁사)는 만들지 않는다
- Paddle Retain(`pwCustomer`)은 쓰지 않는다(일회 결제라 해당 없음)

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋과 커밋하지 않은 변경을 막으므로, PR CI가 도는 동안의 다음 작업은 `git stash`에 두거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.
