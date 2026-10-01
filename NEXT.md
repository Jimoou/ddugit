# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #5(hunk 스테이징)를 squash merge했다(`3c20d93`).

## 지금 하는 일

M2 · 충돌 해결 화면 완료 → PR #6에서 CI 대기 (10분 뒤 확인 예약)

- 백엔드 `git/conflict.rs`, 테스트 40
- `src/conflict.ts`: 마커 파서와 `resolveText`, vitest 6 (diff3, CRLF, 끝나지 않은 블록 포함)
- `ConflictSheet`: 블록 선택, 파일 전체 선택, 바이너리 처리. `run()`이 conflict 상태를 받으면 자동으로 열리고, 배너의 "충돌 해결" 버튼과 커밋 작성기의 충돌 파일 클릭으로도 열림
- 데모: `window.__otgitDemo.conflictNext = true` 후 병합하면 충돌 파일 2개가 생김

## 다음 단계

1. 그래프에 진행 중인 병합 표시 (HEAD 옆에 "병합 중" 점선 노드와 들어오는 쪽 연결선)
2. 충돌 블록 직접 편집
3. M3 시작: 이전 이력 더 불러오기, 파일 감시로 자동 새로고침

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
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
