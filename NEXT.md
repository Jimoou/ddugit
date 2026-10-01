# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #31(저장소 연결: clone, 최근 목록·즐겨찾기, init, 끌어다 놓기)을 squash merge했다(`b7620a3`).
- v0.1.0 초안 Release가 있다(빌드 성공). 사용자가 Publish하면 태그가 생긴다.

## 지금 하는 일

M6 멀티탭 → PR CI 대기

- `App.tsx` = 탭 셸: 탭 목록(`tabs.ts`: openIn·addEmpty·closeTab·cycle·selectAt·저장), 설정, 연결(clone·init·끌어다 놓기), 알림(`toasts floating`), 워프
- `RepoView.tsx` = 예전 App 본문. 탭마다 하나씩 떠 있다. `active`가 아니면 `hidden`이고 키 입력·파일 감시·탑바가 없다. 탭에 돌아오면 새로고침한다
- 숨은 탭: `GraphCanvas`·`Minimap`은 캔버스가 0×0이면 그리지 않는다. 다시 보일 때 카메라를 옮기지 않는다
- 데스크톱은 `otgit.tabs`에 열린 탭을 저장한다(예전 `otgit.lastRepo`도 이어받음). 데모는 데모 탭 하나로 시작한다

## 다음 단계 (M6 순서, ROADMAP 참고)

1. 고급 git 작업: 실수 되돌리기(reset soft/mixed/hard, 마지막 커밋 취소, reflog 복구) → 브랜치 정리 → 과거 커밋 손보기 → bisect·blame. 각 기능에 맞는 우주 연출을 함께 넣는다(되돌리기 = 시간을 감는 효과)
2. 기존 기능의 게임 같은 연출: 원격(궤적·유성) → 그래프 작업(중력장·혜성·별자리) → 충돌
3. 그다음 M4 PR 연동(토큰 방식 결정 필요: `gh auth token` 재사용 vs 키체인)
4. 제안 중: 첫 실행 튜토리얼(미션). 사용자 답을 기다린다

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
