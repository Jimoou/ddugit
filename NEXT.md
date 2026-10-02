# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #41(이름 변경 otgit → ddugit, CI 절감)을 squash merge했다(`0bc7ca2`). CI는 PR에서만, 바뀐 쪽만 돌고 Rust는 ubuntu만 돈다.
- 저장소가 `Jimoou/ddugit`(public)이 됐다. git remote도 바꿨다. 세션에 `jimoou/ddugit`을 추가해야 push된다(이미 했다).

## 지금 하는 일

M4 PR 연동 → PR CI 대기

- Rust `forge.rs`
  - `parse_remote`: https, scp, ssh 형식에서 GitHub·GitLab과 slug를 읽는다
  - 토큰: `gh auth token` / `glab config get token`이 먼저, 없으면 keyring(서비스 `ddugit`, 사용자 = host)
  - ureq로 열린 PR·MR을 받는다. 401·403이면 `unauthorized`
  - 테스트 4개
- 명령: `pull_requests`, `set_forge_token`, `open_url`(https만)
- 프론트
  - `components/Pulls.tsx`: `prRefs`(그래프 라벨), `PullSection`(사이드바), `TokenDialog`
  - `RepoView`: 탭이 보일 때 읽고 5분마다 다시 읽는다. 원격 작업이 성공해도 다시 읽는다
  - ⚿(토큰 관리)는 키체인 토큰을 쓸 때만 보인다
- 데모: `demoControls.forgeToken`

## 다음 단계

1. PR 연동 2단계(선택): PR의 CI·리뷰 상태(체크 성공·실패·대기, 승인·변경 요청)를 라벨 색으로 보여 준다
2. 제안 중: 첫 실행 튜토리얼(미션)
3. 릴리스: 이름이 바뀌었으니 v0.1.0 초안은 지우고 ddugit 이름으로 새 초안을 만드는 것을 제안한다. 릴리스 전에 "CI · Rust"를 `all_os`로 수동 실행한다

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI(Web, E2E, Rust ×3)가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
