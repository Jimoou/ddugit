# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #10(라벨 겹침 회피)을 squash merge했다(`3f4e8f7`).

## 지금 하는 일

M2 마무리 · 줄 단위 스테이징 + 충돌 블록 직접 편집 → PR #11에서 CI 대기 (10분 뒤 확인 예약)

- `git/stage.rs`
  - `stage_hunks(.., lines: Option<&[usize]>, ..)`: hunk 하나 안에서 고른 줄만 옮긴다
  - `select_lines()`: 고르지 않은 `-`는 문맥으로 남기고 고르지 않은 `+`는 버린다. 내리기(`--reverse`)는 반대로 한다
  - hunk 헤더의 줄 수를 다시 계산한다. 한쪽이 비면 git 표기대로 시작 줄을 하나 앞으로 당긴다
  - 줄 번호는 **지금 보이는 diff 기준**이다. 스테이지한 뒤에는 diff가 바뀐다
- `DiffSheet`: 바뀐 줄의 번호/부호 칸을 누르면 고르고, Shift를 누르면 범위로 고른다. 줄을 고르면 hunk 버튼이 "선택한 N줄 스테이지"로 바뀐다
- `conflict.ts`
  - `Pick`에 `{ text }`(직접 편집)를 추가했다
  - `blockText()`가 블록의 줄바꿈(CRLF)을 지키고 끝에 줄바꿈을 붙인다
  - `ConflictSheet`에 "직접 편집" 버튼과 textarea를 붙였다
- 알림(toast)을 `.stage-graph` 안으로 옮겼다. 이제 아래 시트가 알림을 가리지 않는다

## 다음 단계

1. M3 · 시맨틱 줌 확장 (일직선 구간을 막대로 접기)
2. M3 · 대형 저장소 성능 (레이아웃 Web Worker, diff 가상 스크롤)
3. M5 · ESLint + Playwright e2e를 CI에 추가 (지금은 스크래치 스크립트로만 확인)

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
