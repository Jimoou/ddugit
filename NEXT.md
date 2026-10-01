# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- 영어 번역 완료: PR #26, #27, #28을 squash merge했다(`78ed8a8`).
- Release 수동 실행 시험: dmg(6.6MB)와 exe(2.2MB) artifact가 나왔다(run 36838768528, 번역 전 코드).

## 지금 하는 일

v0.1.0 초안 Release

- 이 세션에서는 태그 push가 막힌다(git 프록시가 세션 브랜치만 받는다)
- 그래서 `release.yml` 수동 실행에 `release` 옵션을 추가했다. 켜면 `tauri-action`이 `v__VERSION__`(= v0.1.0) 초안 Release를 만들고 dmg/exe를 올린다
- 사용자가 초안을 공개하면 GitHub가 그 커밋에 `v0.1.0` 태그를 만든다
- merge 후 main에서 `release: true`로 실행하고, 초안에 파일 두 개가 붙었는지 확인한다

## 다음 단계 (남은 ROADMAP)

1. M4: GitHub / GitLab PR 연동(그래프에 PR 상태 표시). 토큰 저장 방식을 정해야 한다
2. M4: 병합이 섞인 구간 rebase(`--rebase-merges`)
3. M3(보류): 레이아웃 Web Worker / WebGL, diff 가상 스크롤. 측정상 지금은 필요 없다
4. M5(나중에): 서명·공증, 자동 업데이트. 계정과 인증서가 필요하다

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI(Web, E2E, Rust ×3)가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

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
- 릴리스 절차는 CLAUDE.md에 있다.
