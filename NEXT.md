# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #46(버전 0.2.0)을 squash merge했다(`80b2a07`).
- main에서 "CI · Rust" `all_os`가 통과했다(macOS·Windows에서 keyring·opener 빌드 확인).
- Release workflow를 `release=true`로 수동 실행했다. v0.2.0 초안이 만들어진다. 사용자에게 링크와 함께 알리고, Publish와 예전 v0.1.0(otgit) 초안 삭제를 부탁한다.

## 지금 하는 일

M7 대각선 요약 라벨 → PR CI 대기

- `graph/captions.ts`의 `captionLength(grid, row, lane, laneCount, max, gap, dir)`: 월드 좌표로 계산한다
  - 아래 방향(1): 레인을 하나씩 내려가며 별을 지나치면(수직 거리 < 15) 반 레인 전에 멈춘다. 평행한 이웃 요약과의 거리가 gap(줄 높이, 줌에 따라 14/k)보다 가까우면 그 요약이 시작하는 곳에서 멈춘다
  - 위 방향(-1): 위 레인에 커밋이 있으면(왼쪽 3칸까지 포함) 그 지점에서 멈춘다. 그 커밋의 아래 방향 요약과 교차하기 때문이다
- renderer `drawCaption`
  - 아래 방향이 우선이다. 모자라고 라벨이 없는 커밋이면 위 방향과 비교한다
  - 어두운 테두리로 레인 선 위에서도 읽히게 한다. 배지보다 먼저 그린다(배지가 위에 온다)

## 다음 단계 (M7 순서)

1. 미리보기 카드(마우스를 올려 두면 요약·본문·파일·+/−·PR)
2. 90° 회전(0/90/180/270, 글자는 바로 서게, 설정에 저장)

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
