# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #22(키보드로 커밋 이동, 스크린리더 안내)를 squash merge했다(`2aa0abf`).

## 지금 하는 일

M4 · 그래프 위에서 Shift+끌기로 커밋 순서 옮기기 → PR #23에서 CI 대기 (10분 뒤 확인 예약)

- `rebasePlan.ts` `planMove(byId, head, source, target)`
  - HEAD부터 첫 병합 전까지의 일직선 구간에서, source를 target 바로 다음으로 옮긴 계획을 만든다
  - 기준은 둘 중 오래된 커밋의 부모다
  - 바뀌는 게 없거나 구간 밖이거나 루트이면 null을 돌려준다
- 드래그 모드 `move`(Shift)
  - `canDropOn(target, source, mode)`가 `planMove`로 놓을 수 있는지 판단한다
  - 선은 보라색으로 그리고, 상황별 안내 문구를 띄운다
- 놓으면 바로 rebase하지 않는다. 그 계획을 담은 RebaseSheet(`initial`)가 열리고, 사용자가 확인한 뒤 적용한다. 시트 key에 계획을 넣어 드래그할 때마다 새로 시작한다
- 하단 도움말과 단축키 표에 Shift+끌기를 넣었다

## 다음 단계

1. M5 · 밝은 테마 (CSS 토큰 + 캔버스 색 분리)
2. M5 · i18n(영어). 문자열을 추출해야 해서 규모가 크다
3. M5 · 자동 업데이트, 서명. 둘 다 인증서와 배포 설정이 필요하므로 사용자가 결정해야 한다

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
