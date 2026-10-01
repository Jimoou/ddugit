# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #17(interactive rebase)을 squash merge했다(`5a95888`). Windows에서도 `sequence.editor=cp`가 동작하는 것을 CI로 확인했다.

## 지금 하는 일

강제 push → PR #18에서 CI 대기 (10분 뒤 확인 예약)

- `RemoteOp::ForcePush` = `push --force-with-lease --progress`. 거부되면 `Rejected`
- `SyncDialog`(Push 거부됨)에 세 번째 선택 "덮어쓰기 (강제 push)"를 붙였다. 원격에만 있는 커밋 N개가 지워진다고 밝힌다
  - 주의: 거부되면 App이 바로 fetch하므로, lease가 지켜 주는 것은 **이 창을 연 뒤에** 올라온 커밋뿐이다. 문구도 그렇게 썼다
- 테스트
  - Rust: amend 후 일반 push는 거부되고 강제 push는 성공한다. 다른 사람이 push한 뒤 fetch 없이 강제 push하면 거부된다
  - e2e: push → amend → 거부 → 덮어쓰기

## 다음 단계

1. M5 · React Compiler 규칙 켜기 (setState-in-effect 8곳 정리)
2. 백포트: 여러 대상 한눈에 보기 (고객사별 미반영 개수 표)
3. M5 · 설정 화면 (테마, 애니메이션, git 경로), 단축키 표

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
