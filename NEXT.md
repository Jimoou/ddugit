# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #12(일직선 구간 접기)를 squash merge했다(`0dea355`).
- 대형 저장소 성능을 측정했고, 지금은 손댈 필요가 없어서 보류했다. 수치는 ROADMAP M3에 적었다.

## 지금 하는 일

M5 · Playwright e2e를 CI에 추가 → PR #13에서 CI 대기 (10분 뒤 확인 예약)

- `playwright.config.ts`: `npm run dev`(데모)를 띄우고 `e2e/*.e2e.ts`를 실행한다. vitest와 겹치지 않도록 확장자를 `.e2e.ts`로 했다
- `e2e/fixtures.ts`
  - `demo` fixture가 페이지 오류를 모으고, 오류가 있으면 테스트를 실패시킨다
  - `snapshot()`, `mutate()`, `screenOf()`, `toast()`, `zoom()`을 제공한다
- `e2e/app.e2e.ts`: 커밋, 드래그 병합, 충돌 직접 편집, 줄 스테이징, 직선 구간 접기
- CI에 `E2E (Playwright · demo)` 잡을 추가했다. 실패하면 trace를 artifact로 올린다
- 로컬(샌드박스) 실행: `PW_CHROMIUM=/opt/pw-browsers/chromium npm run e2e`
- `--repeat-each=3`으로 4번 돌려 60회 모두 통과했다. 줄 스테이징 테스트의 경쟁 상태 하나를 고쳤다

## 다음 단계

1. M5 · ESLint (typescript-eslint + react-hooks), CI에 추가
2. M4 · 멀티 레포 백포트 트래커 (원래 질문: 원본 ↔ 고객사 레포 공통 수정 반영)
3. M4 · 드래그로 interactive rebase

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
