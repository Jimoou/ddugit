# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #21(설정 화면, git 경로, 단축키 표)을 squash merge했다(`62759c0`).

## 지금 하는 일

M5 · 접근성: 키보드로 커밋 이동 → PR #22에서 CI 대기 (10분 뒤 확인 예약)

- `graph/navigate.ts` `stepFrom(layout, id, step)`
  - older: 첫 부모
  - newer: 같은 레인의 자식을 우선한다
  - up / down: 가장 가까운 레인에서 행 거리가 가장 짧은 커밋
- `GraphCanvas`
  - 처음 누른 화살표는 HEAD를 고르고, 그다음부터 이동한다. Enter(또는 메뉴 키)는 그 커밋의 메뉴를 노드 옆에 연다
  - 고른 커밋이 화면 밖이면 배율을 유지한 채 그쪽으로 옮긴다
  - 포커스가 body나 캔버스에 있을 때만 동작한다. 그래야 시트나 목록의 화살표 스크롤을 가로채지 않는다
  - 캔버스에 `tabIndex=0`, `role="application"`, 사용법 `aria-label`을 붙였다. 선택한 커밋(짧은 SHA, 요약, ref, HEAD)은 `aria-live`로 읽어 준다
- 단축키 표(`SHORTCUTS`)에 화살표와 Enter를 추가했다

## 다음 단계

1. M3 · 그래프 위에서 노드를 끌어 바로 rebase 순서 바꾸기
2. M5 · i18n(영어). 문자열을 추출해야 해서 규모가 크다
3. M5 · 테마(밝은 테마)

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
