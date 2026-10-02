# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #47(대각선 요약)을 squash merge했다(`f3e250b`).
- v0.2.0 Release workflow가 돌고 있다(main `80b2a07`, 수동 실행). 끝나면 사용자에게 초안 링크를 알리고, Publish와 예전 v0.1.0(otgit) 초안 삭제를 부탁한다.

## 지금 하는 일

M7 미리보기 카드 → PR CI 대기

- GraphCanvas `onHover(id|null)`: 호버한 커밋이 바뀔 때만 알린다(`hoverSent`). 누르기·휠·떠나기에서는 null을 알린다(카메라가 움직이면 위치가 틀리므로)
- RepoView: 0.35초(`PEEK_DELAY_MS`) 뒤 `screenOf`로 위치를 잡는다. 선택한 커밋이나 메뉴가 열려 있을 때는 띄우지 않는다
- `components/Peek.tsx`: 요약, 본문 앞 3줄(`bodyPreview`), ID·작성자·시각, PR 라벨, 파일 5개와 +/− 막대(`api.commitDiff` 캐시). `pointer-events: none`

## 다음 단계 (M7)

1. 브랜치 맵 90° 회전(0/90/180/270, 설정에 저장): 카메라·히트 테스트·미니맵·라벨·대각선 요약·연출 좌표가 모두 회전을 따르고, 글자는 바로 서게

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI(Web, E2E, Rust ×3)가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
