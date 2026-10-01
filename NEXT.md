# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #6(충돌 해결 화면)을 squash merge했다(`6f8978a`). Windows 러너의 전역 `core.autocrlf=true` 때문에 테스트가 실패해서, 테스트 저장소에 `core.autocrlf=false`를 고정했다.

## 지금 하는 일

진행 중 병합을 그래프에 표시 → PR #7에서 CI 대기 (10분 뒤 확인 예약)

- 스냅샷에 `incoming`(MERGE_HEAD / CHERRY_PICK_HEAD / REVERT_HEAD)을 추가하고 revwalk에도 넣었다(어떤 ref에도 없는 SHA도 보이도록). 테스트 41
- 렌더러: 들어오는 커밋 → ＋ 노드를 빨간 점선으로 잇고, "병합 대기" 문구를 넣고, ＋ 노드를 빨간색으로 표시. `ALERT` 색은 `scene.ts`에 둔다
- 알림(toast)을 화면 아래로 옮겼다(배너 버튼을 가리지 않도록)

## 다음 단계

1. M3 · 이전 이력 더 불러오기 (3000개 제한 → 끝에 "더 보기" 노드, limit 증가)
2. M3 · 파일 감시로 자동 새로고침 (notify crate → Tauri 이벤트)
3. 충돌 블록 직접 편집, 줄 단위 스테이징

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
