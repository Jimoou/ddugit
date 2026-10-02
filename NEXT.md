# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #42(M4 PR 연동)를 squash merge했다(`95b6fff`).
- 사용자 결정(2026-10-02): 세 작업을 차례로 한다. 1) PR CI·리뷰 상태 표시, 2) 첫 실행 튜토리얼, 3) ddugit 이름의 릴리스 초안. 그리고 "브랜치 맵에서 커밋 내용이 첫눈에 보이게"를 기획해서 제안했다(답을 기다린다):
  1. 대각선 요약 라벨(40°, 100%에서도 30~40자)과 줌 단계별 정보량
  2. 종류 기호(Conventional/키워드)와 변경량을 별 밝기로
  3. 미리보기 카드(요약·본문·파일·+/−)
  4. (선택) 세로 목록 보기 전환

## 지금 하는 일

1. PR CI·리뷰 상태 → PR CI 대기

- `forge.rs`: REST 대신 GraphQL 한 번으로 PR 목록과 상태를 함께 받는다(GitHub `statusCheckRollup`·`reviewDecision`, GitLab `headPipeline.status`·`approved`). HTTP 200이어도 GraphQL 오류가 있으면 실패로 본다
- `PullRequest.checks`(success/failure/pending)와 `review`(approved/changes/required)
- 라벨 색은 `PR_COLOR[checks]`(renderer), 이름 뒤에 ✓/✎. 사이드바에는 CI 점과 승인·수정 요청 칩

## 다음 단계

2. 첫 실행 튜토리얼(미션)
3. 릴리스: v0.1.0(otgit) 초안을 지우고, "CI · Rust"를 `all_os`로 수동 실행한 뒤 ddugit v0.1.0 초안을 만든다
4. 커밋 내용 보이기: 사용자 답에 따라

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
