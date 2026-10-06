# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-06_

## 방금 끝난 것

- v1.0.0 릴리스(#128, Release 성공: macOS 서명·공증 dmg, Windows exe, `latest.json` 갱신)
- 사이트 SEO(ddugit-site #25): sitemap·robots·페이지별 제목/설명/canonical·OG 이미지·JSON-LD
- Lemon Squeezy 스토어 심사 거절(사유 비공개) → **Paddle Billing으로 전환**(ddugit-site #26): `paddle-webhook`, Paddle.js 오버레이 체크아웃, 약관(판매자 Kim Jiwoon 개인·Paddle MoR 문구·환불 14일)·개인정보, 연락처 kfromh0136@gmail.com

## 결정 (2026-10-06)

- 판매자: 개인 **Kim Jiwoon**(Paddle 계정의 법적 이름과 같아야 함, 사이트 `SITE.seller`). 연락처: kfromh0136@gmail.com(사이트 `_shared/contact.ts`). 앱에는 이메일 없음(신고는 HTTPS)
- 환불 14일(Paddle 요구). 사이트 라이선스의 업데이트 기한은 두지 않는다(이전 버전을 계속 쓰는 것도 막지 않음)
- 앱 코드는 바뀌지 않는다: 구매 버튼은 `ddugit.com/pricing`, 라이선스는 사이트 계정 로그인으로 받는다

## 다음 단계 (사용자)

1. Paddle 가입(개인, 이름 Kim Jiwoon) → Checkout → Website approval에 `ddugit.com`
2. ddugit-site README "판매(Paddle Billing)" 순서: 상품·가격($29 one-time), 기본 결제 링크 `/checkout`, 토큰·API 키, Notifications(`paddle-webhook`)
3. Supabase Secrets: `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRODUCT_ID`, `PADDLE_API_KEY`, `PADDLE_ENV`, `REPORT_SALT`, `REPORT_FORWARD_SECRET`(Netlify에도). 옛 `LEMONSQUEEZY_*`는 지우고, 배포된 `ls-webhook` 함수도 지운다(`supabase functions delete ls-webhook`)
4. Netlify: `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`·`_PRICE_ID`·`_ENV`. 옛 `NEXT_PUBLIC_LS_CHECKOUT_URL` 삭제
5. sandbox로 구매 → 앱 활성화 → 환불까지 → live로 같은 설정
6. Supabase Auth: Email 제공자 끄기(또는 Confirm email 켜짐 확인). 라이선스·관리자 권한이 로그인 이메일 기준이라서
7. Search Console: `sitemap.xml` 제출, 주요 페이지 색인 요청
8. `docs/QA.md` 4장 실기 대본(0.8.0 → 1.0.0 자동 업데이트 포함), Windows 실기. (출시 뒤) Windows 서명

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.
- 회사 서버(Enterprise·자체 GitLab)의 PR 연동은 `gh`/`glab` 설정에 로그인된 호스트이거나 붙여 넣은 토큰이 있어야 한다(#122)

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋과 커밋하지 않은 변경을 막으므로, PR CI가 도는 동안의 다음 작업은 `git stash`에 두거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
  - 회전한 채로 열기: `localStorage["ddugit.settings"] = '{"rotation":3}'`
  - 은하 대시보드: `localStorage["ddugit.recent"]`에 경로를 넣고(그룹은 항목의 `group` + `localStorage["ddugit.groups"]`) 새로고침 → 새 탭. 데모의 각 경로는 경로 해시로 만든 상태, `gone`이 든 경로는 찾을 수 없음
  - 데모에는 원격에만 있는 브랜치 `origin/feature/orbit-sync`가 있다
  - 데모에는 서브모듈 둘(하나는 초기화 안 됨)과 LFS(패턴 둘, 받지 않은 파일 셋)가 있다. worktree는 `api.worktree("demo", …)`로 추가
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- Rust 테스트의 git은 로컬 폴더 원격을 허용한다(`mod.rs` `command()`의 `#[cfg(test)]`, 서브모듈 테스트용).
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
