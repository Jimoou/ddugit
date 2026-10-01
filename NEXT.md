# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #11(줄 단위 스테이징, 충돌 직접 편집)을 squash merge했다(`d3461b1`). M2를 완료했다.

## 지금 하는 일

M3 · 시맨틱 줌 확장(일직선 구간 접기) → PR #12에서 CI 대기 (10분 뒤 확인 예약)

- `graph/runs.ts` `straightRuns(layout, keep, min = 4)`
  - 연속된 행에서 같은 레인을 따라가며 부모도 자식도 하나뿐인 커밋을 묶는다
  - ref, HEAD, stash 기준, 병합 대기 커밋은 `keep`으로 빠진다
- `renderer.ts`
  - `ZOOM.fold = 0.5`보다 작으면 묶인 구간을 막대 하나와 커밋 개수로 그린다
  - 막대에 마우스를 올리면 "커밋 N개 · 눌러서 펼치기"가 뜬다
  - `foldedRun()`이 정하는 예외: 검색 중이면 아무것도 접지 않고, 선택된 커밋이 있는 구간은 펼친 채로 둔다
- `GraphCanvas`
  - 접힌 노드는 클릭 대상에서 뺀다
  - 막대를 누르면(`runAt` → `openRun`) 그 구간이 펼쳐지는 배율까지 확대한다
- 데모: `window.__otgitDemo.grow(n)`이 현재 브랜치에 커밋 n개를 붙인다

## 다음 단계

1. M3 · 대형 저장소 성능 (레이아웃 Web Worker, diff 가상 스크롤)
2. M5 · ESLint + Playwright e2e를 CI에 추가 (지금은 스크래치 스크립트로만 확인)
3. M4 · 멀티 레포 백포트 트래커 (원래 질문: 원본 ↔ 고객사 레포 공통 수정 반영)

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
