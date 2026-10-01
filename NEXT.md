# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #13(Playwright e2e, CI 잡)을 squash merge했다(`1de7c77`).
  - e2e가 첫 CI 실행에서 실제 버그를 잡았다. 최신 Chromium은 `scrollTo`가 Promise를 반환해서 diff 시트가 깨졌다. effect 5곳을 블록 본문으로 바꿨다.

## 지금 하는 일

M5 · ESLint → PR #14에서 CI 대기 (10분 뒤 확인 예약)

- `eslint.config.js`
  - typescript-eslint 권장 규칙, react-hooks `rules-of-hooks`·`exhaustive-deps`(error)
  - `no-restricted-syntax`로 effect 식 본문을 금지한다
- react-hooks v7의 React Compiler 규칙은 아직 켜지 않았다. 켜면 `set-state-in-effect`에 8곳이 걸려서 ROADMAP에 후속 항목으로 남겼다
- `npm run lint`를 만들고 `npm run check`와 CI Web 잡에 넣었다
- 이제 필요 없어진 `eslint-disable` 2줄을 지웠다

## 다음 단계

1. M4 · 멀티 레포 백포트 트래커 (원래 질문: 원본 ↔ 고객사 레포 공통 수정 반영). 설계부터 한다
2. M4 · 드래그로 interactive rebase
3. M5 · React Compiler 규칙 켜기 (setState-in-effect 8곳 정리)

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
