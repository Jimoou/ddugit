# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-05_

## 방금 끝난 것

- v1.0.0 버전 올림(이 PR) → merge 후 main에서 Release 수동 실행
- v1 준비: 문제 신고·문의는 HTTPS(`ddugit.com/api/report`, 사이트 #23 관리자 대시보드 `/admin`), 첫 실행 안내(#119), 큰 저장소 성능(#120), 영문 문구(#121)
- 점검: Rust(#122)·웹(#123)·사이트(ddugit-site #24) 보안·정확성, 구조 정리(#126)
- 전체 기능 QA: `docs/QA.md`(#124) — 153항목 중 자동 139·부분 11·없음 3, 실기 28(4장 사용자 대본). Rust 빈칸(#125), e2e 빈칸(#127, 충돌 시트가 취소 뒤 남던 버그 고침)

## 결정

- 수익 모델: $29 한 번 결제, 평생 사용 + 모든 업데이트, 라이선스당 기기 3대, 체험 없음(#116, 사이트 #21)
- 사이트 라이선스(붙여 넣기)의 `updatesUntil`은 지금 강제하지 않음 — 제품 결정 남음

## 다음 단계 (사용자)

- Supabase 시크릿: `LEMONSQUEEZY_PRODUCT_ID`, `REPORT_SALT`, `REPORT_FORWARD_SECRET`(Netlify에도), 필요하면 `ALLOW_TEST_LICENSES`
- Supabase Auth: Email 제공자를 끄거나, 이메일 확인·안전한 이메일 변경을 켠다
- Lemon Squeezy: Single payment $29 상품, 웹훅, `NEXT_PUBLIC_LS_CHECKOUT_URL`
- GitGuardian 사건 37879601을 오탐으로 닫기
- `docs/QA.md` 4장 실기 대본(0.8.0 → 1.0.0 자동 업데이트 포함), Windows 실기
- (출시 뒤) Windows 서명

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
