# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #43(PR CI·리뷰 상태 표시)을 squash merge했다(`d38c81e`).
- 사용자 결정(2026-10-02, ROADMAP M7): 커밋 내용 기획 중 1(대각선 요약)과 3(미리보기 카드)은 하고, 2(종류 기호·변경량)는 하지 않는다. 4는 세로 목록 대신 **브랜치 맵 90° 단위 회전**으로 한다. 아이콘은 자체 SVG로 바꾼다(외부 아이콘 라이브러리는 없고, 지금은 유니코드·이모지 글자다)

## 지금 하는 일

M7 튜토리얼 → PR CI 대기

- `missions.ts`: `MISSIONS`, `Voyage {done, dismissed}`, `parseVoyage`, `complete`, `current`
- `components/Missions.tsx`
  - `useVoyage(enabled)`: localStorage `ddugit.voyage`에 저장한다. 데모 경로에서만 켜진다. `mission(id)`
  - `MissionPanel`: 그래프 왼쪽 아래 패널. 접기·닫기, 끝나면 "내 저장소 열기"(`onRepoMenu`)
- RepoView 호출 지점
  - `show({commit})` → inspect
  - 커밋 성공 → commit
  - 병합 `.then` → merge
  - `doReset` → undo
  - 범인을 찾으면 → bisect
  - push 성공 → push
- 닫았으면 탑바 "데모 모드 · ✦" 버튼으로 다시 연다
- e2e fixture는 `addInitScript`로 튜토리얼을 기본으로 닫아 둔다(그래프를 가리지 않게). 튜토리얼 테스트만 연다

## 다음 단계 (M7 순서)

1. 릴리스 초안 ddugit v0.2.0: 버전 세 곳을 올리고, "CI · Rust"를 `all_os`로 실행한 뒤 Release를 수동 실행한다. 예전 v0.1.0(otgit) 초안은 사용자에게 지워 달라고 한다
2. 자체 SVG 아이콘(`components/Icon.tsx`)과 캔버스 Path2D 아이콘
3. 대각선 요약 라벨
4. 미리보기 카드
5. 90° 회전(카메라·히트 테스트·미니맵·라벨이 바로 서게, 설정에 저장)

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
