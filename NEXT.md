# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR [Jimoou/otgit#1](https://github.com/Jimoou/otgit/pull/1)을 squash merge했다(`e588fba`). CI는 3개 OS 모두 통과. 작업 브랜치는 `main`에서 다시 시작했다.

## 지금 하는 일

M2 · 커밋 조작 + 우클릭 메뉴 (PR #2 예정)

- [x] 백엔드
  - `git/pick.rs`: cherry-pick(`-x`) / revert, 병합 커밋은 `-m 1`, 대상 브랜치 자동 체크아웃(`prepare_on`)
  - `commit(…, amend)`, `continue_op`(rebase / cherry-pick / revert)
  - 테스트 29
- [ ] 프런트
  - `api`: `git_commit.amend`, `git_continue`, `git_pick` + `mock` 구현
  - `ContextMenu`: 노드 우클릭 → 여기서 브랜치 / 체크아웃 / HEAD에 cherry-pick / revert / amend(HEAD일 때) / SHA 복사
  - Alt(⌥)를 누른 채 끌어서 놓으면 cherry-pick (그냥 끌면 merge)
  - 커밋 작성기에 amend 모드, 배너에 cherry-pick/revert 계속·취소
- [ ] PR 올리고 CI 통과 확인

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__otgit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__otgitDemo.failNextRemote = "https" | "ssh"`
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
