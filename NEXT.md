# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-02_

## 방금 끝난 것

- PR #48(미리보기 카드)을 squash merge했다(`68fdf86`).
- v0.2.0 Release 초안이 만들어졌다(run 36950748275, `80b2a07` 기준이라 대각선 요약·미리보기 카드·회전은 빠져 있다). 공개와 예전 v0.1.0(otgit) 초안 삭제는 사용자가 한다.

## 지금 하는 일

M7 브랜치 맵 90° 회전 → PR CI 대기

- `View.r`(0..3, 시계 방향 1/4 바퀴). `turn`, `toScreen`/`toWorld`/`viewAt`이 회전을 처리하고, 월드 그리기는 `setTransform`에 회전 행렬을 넣는다. 글자·배지·아이콘은 화면 좌표로 그려서 늘 바로 선다
- 카메라: `camera.turnBounds`로 clamp와 fit, 회전할 때는 화면 가운데 점(그래프 안으로 당긴 점)을 그대로 둔다
- 입력: 휠은 가로면 시간 축(아래로 = 과거), 세로면 목록처럼 위아래(Shift는 레인 방향). 화살표는 화면 방향을 그래프 방향으로 되돌려 `stepFrom`에 넘긴다. `R` 키, HUD 버튼(지금 각도 표시)
- 그리기: 케이블(HEAD→+, 끌기, 병합 대기)은 시간 축을 따라 휘고, 접힌 구간은 세로 막대도 된다. 180°는 대각선 요약의 행·레인 방향을 뒤집는다(`captionLength(..., flip)`). 90°/270°는 커밋마다 한 줄이라 레인 끝(`laneReach`) 다음에 배지(`inlineBadges`)와 요약을 가로로 쓴다
- 미니맵도 회전하고, 세로면 오른쪽 세로 띠가 된다(`.graph.upright`)
- 숨은 탭의 그래프는 단축키를 받지 않는다(`offsetParent` 확인). 전에는 ←→·H·0이 숨은 탭에도 갔다

## 다음 단계

M7이 끝나면 사용자에게 다음 마일스톤을 묻는다. 새 기능이 쌓였으니 v0.3.0 초안도 제안한다.

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
  - 회전한 채로 열기: `localStorage["ddugit.settings"] = '{"rotation":3}'`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
