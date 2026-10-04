# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-04_

## 방금 끝난 것

- v0.6.0 Release run(37188669909): 빌드는 됐지만 GitHub Release 초안 만들기가 403. 사용자 결정: 원인 조사 없이 **GitHub Release를 쓰지 않는다**. 이 PR에서 `release.yml`은 빌드 + artifact + Supabase 업로드만.
- 사이트 골격 ddugit-site#1(홈·다운로드·가격·변경 내역·약관·개인정보 초안·계정 자리). 사용자가 Netlify 연결·도메인을 맡음.

## 지금 하는 일

- v0.6.0 Release(GitHub Release 없이) 실행 중 → artifact 확인 → 사용자 실제 기기 점검.
- M13 자동 업데이트 PR: `update.rs` + `UpdateNotice` + `release.yml`(키가 있으면 업데이트 파일·`latest.json`). CI · Rust all_os 필요(플러그인 추가).

## 다음 단계

- 사용자 준비물(ddugit 저장소): Secrets `SUPABASE_S3_ACCESS_KEY_ID`·`SUPABASE_S3_SECRET_ACCESS_KEY`·`TAURI_SIGNING_PRIVATE_KEY`·`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, Variables `SUPABASE_PROJECT_REF`·`SUPABASE_REGION`. 사이트(Netlify)에는 `NEXT_PUBLIC_DOWNLOADS_URL`만
- 자동 업데이트 실제 확인: 업데이트 기능이 든 첫 릴리스(v0.6.1 등)를 설치하고, 그다음 릴리스에서 알림·설치·재시작
- M14: Supabase Auth(GitHub·Google) + 내 계정. 사용자 준비물: Supabase URL·anon key(Netlify 환경 변수), OAuth 앱
- M15: 구독 라이선스, Lemon Squeezy(월 4,900원 + 연 49,000원). 구독이 끝나면 안내만(확인 필요)
- 사용자: v0.6.0 실제 기기 점검, 세무(사업자등록·통신판매업)

## 결정 (2026-10-04)

- 오픈소스 아님, 저장소 비공개. GitHub Release를 만들지 않는다(배포는 ddugit.com, 파일은 Supabase Storage). Windows는 서명 없이. 다운로드·앱 사용에 로그인 없음, 구매·라이선스에만 로그인.

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

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
