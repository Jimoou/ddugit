# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #18(강제 push)을 squash merge했다(`d6bf590`).

## 지금 하는 일

M5 · React Compiler 린트 규칙 켜기 → PR #19에서 CI 대기 (10분 뒤 확인 예약)

- `eslint.config.js`: `reactHooks.configs.recommended.rules`를 전부 켰다(`exhaustive-deps`는 error)
- effect 안에서 setState하던 9곳을 정리했다
  - 렌더 중에 조정: App 경로 변경 초기화, Composer 부분 스테이지 감지, DiffSheet 바깥에서 고른 파일
  - 키와 함께 저장: App 사이드 패널 파일(`panel.id`), ConflictSheet 불러온 파일과 블록 선택, DiffSheet 줄 선택(diff 객체가 키)
  - ConflictSheet: 해결된 파일에서 다음 파일로 넘어가는 것을 effect 대신 파생 값으로 처리한다
  - App: diff 다시 불러오기를 `fetchDiff`(비동기 setState만)와 `loadDiff`(시트 열기)로 나눴다. 첫 스냅샷 로드는 promise로 바꾸고, 저장소를 바꾼 뒤 늦게 온 응답은 버린다
- e2e가 실제 버그를 하나 잡았다. 파일이 아직 없을 때 `loaded?.file === file`이 `undefined === undefined`로 참이 돼서 충돌 시트가 죽었다. 고치고 CONVENTIONS에 적었다

## 다음 단계

1. 백포트: 여러 대상 한눈에 보기 (고객사별 미반영 개수 표)
2. M5 · 설정 화면 (테마, 애니메이션, git 경로), 단축키 표
3. M5 · 키보드로 노드 이동(접근성)

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
