# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #8(이전 이력 더 불러오기)을 squash merge했다(`fd705ac`).

## 지금 하는 일

M3 · 파일 감시 자동 새로고침 → PR #9에서 CI 대기 (10분 뒤 확인 예약)

- `git/watch.rs`
  - `notify-debouncer-mini`(300ms)로 작업 트리 전체를 감시한다
  - `relevant()`가 무시할 경로를 걸러낸다: `.gitignore`된 경로, `.git/objects`, `.git/logs`, `*.lock`
  - macOS의 `/var` ↔ `/private/var` 경로 차이 때문에 루트를 원래 경로와 canonical 경로 둘 다 확인한다
- `lib.rs`: `watch_repo` 명령, `Watching` 상태(새로 감시를 시작하면 이전 감시는 drop되어 멈춤), `repo-changed` 이벤트
- 프런트: `api.watch(path, onChange)` → `listen` + `invoke`. 데모에서는 아무 일도 하지 않는다
- 테스트 43. 실제 앱(Xvfb)에서 터미널로 커밋하면 클릭 없이 그래프에 바로 나타나는 것을 확인했다

## 다음 단계

1. 라벨 겹침 회피 (인접 노드 배지가 가로로 겹침)
2. 충돌 블록 직접 편집, 줄 단위 스테이징
3. M3 · 시맨틱 줌 확장 (일직선 구간을 접기)

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
