# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #16(앱 안에서 원격 추가·삭제)을 squash merge했다(`fac2a73`).

## 지금 하는 일

M4 · interactive rebase → PR #17에서 CI 대기 (10분 뒤 확인 예약)

- `git/rebase.rs` `rebase(path, base, steps)`
  - todo 파일(`.git/otgit-rebase-todo`)을 직접 쓰고 `git -c "sequence.editor=cp '<file>'" rebase -i <base>`로 넣는다. 메시지 편집기는 기존의 `GIT_EDITOR=true`가 처리한다
  - 거부하는 경우: `base..HEAD`에 병합 커밋이 있을 때, 계획이 그 범위의 커밋을 정확히 한 번씩 담지 않았을 때(빠뜨리면 조용히 사라지므로), 처음 남는 커밋이 squash/fixup일 때
  - 충돌은 `conflict_aware`로 기존 충돌 해결 흐름(계속/취소)을 탄다
- `src/rebasePlan.ts`
  - `rebaseRange`: 첫 부모를 따라가며 목록을 만들고, 병합 커밋이 있거나 base가 조상이 아니면 이유를 돌려준다
  - `planProblem`, `resultCount`, `move`
- `RebaseSheet`
  - 행을 끌거나 ↑↓로 순서를 바꾸고, 커밋마다 유지 / 합치기(메시지 합침·버림) / 버리기를 고른다
  - 합칠 커밋은 들여 쓰고, 버릴 커밋은 취소선으로 보여 준다
  - 이미 push한 커밋까지 바뀌면 강제 push가 필요하다고 경고한다(`ahead`로 판단)
- 여는 곳: 현재 브랜치 이력의 커밋 우클릭 → "이 다음 커밋들 정리… (rebase -i)" (병합이 섞여 있으면 비활성)

## 다음 단계

1. 강제 push 지원 (`--force-with-lease`). rebase 뒤 push가 거절되면 SyncDialog에서 고를 수 있게 한다
2. M5 · React Compiler 규칙 켜기 (setState-in-effect 8곳 정리)
3. 백포트: 여러 대상 한눈에 보기

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI 4개(Web, Rust ×3)가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__otgit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__otgitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__otgitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
