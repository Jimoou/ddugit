# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #20(백포트 받는 쪽별 제외 + 대상별 표)을 squash merge했다(`1d0ac4e`).

## 지금 하는 일

M5 · 설정 화면과 단축키 표 → PR #21에서 CI 대기 (10분 뒤 확인 예약)

- `src/settings.ts`
  - `Settings { animate, historyPage, gitPath }`
  - `parseSettings`: 깨지거나 예전 형식인 값은 기본값으로 되돌린다(vitest 3)
  - `SHORTCUTS` 표
- `SettingsDialog`
  - 반짝임 효과, 한 번에 불러올 커밋 수(1천/3천/1만), git 실행 파일 경로(확인하고 적용), 단축키 표
  - `?` 키와 TopBar의 ⚙로 연다. Esc는 window에서 듣는다
- 백엔드 `git::set_program`
  - 전역 `GIT_PATH`에 저장한다. `--version`이 `git version`으로 시작해야 받아들이고, 아니면 기존 값을 그대로 둔다
  - 빈 값이면 PATH의 git으로 돌아간다. 앱을 시작할 때 저장된 경로를 다시 적용한다
- 예전 `otgit.animate` 키는 처음 불러올 때 이어받는다. `?page=N`은 여전히 설정보다 우선한다

## 다음 단계

1. M5 · 키보드로 노드 이동(접근성: ←→ 이전/다음 커밋, ↑↓ 레인, Enter 선택), 스크린리더 라벨
2. M3 · 그래프 위에서 노드를 끌어 바로 rebase 순서 바꾸기
3. M5 · i18n(영어)

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
