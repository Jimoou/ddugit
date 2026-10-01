# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #14(ESLint)를 squash merge했다(`4b08f67`).

## 지금 하는 일

M4 · 멀티 레포 백포트 트래커 → PR #15에서 CI 대기 (10분 뒤 확인 예약)

이 작업은 사용자의 원래 질문(원본 레포 A ↔ 고객사 레포 B, 원격이 다를 때 공통 수정을 양쪽에 반영)을 앱으로 푼 것이다.

- 설계: 고객사 레포 B에 원본 A를 원격(`upstream`)으로 추가하고, 같은 저장소 안에서 `upstream/main`(가져올 쪽)과 `main`(받는 쪽)을 비교한다
- `git/backport.rs`
  - `compare`: `git log --cherry-mark --right-only --no-merges target...source`로 목록을 만든다
    - `=`는 같은 패치라서 반영됨
    - 받는 쪽 커밋 메시지에 `(cherry picked from commit X)`가 있으면 반영됨(-x)이다. 충돌을 고치며 옮겨서 패치가 달라진 경우도 잡는다
    - `otgit.backportIgnored`(로컬 config, 여러 값)에 있으면 제외
    - 나머지는 미반영
  - `apply`: 받는 쪽을 체크아웃하고 `cherry-pick -x a b c`를 실행한다(오래된 것부터). 충돌은 기존 충돌 흐름을 탄다
  - `export`: `format-patch -1 --start-number n -o dir`로 번호가 붙은 `.patch` 파일을 만든다. 폐쇄망 고객사에 보낼 때 쓴다
- `BackportSheet`
  - 두 브랜치를 고른다
  - 미반영/전체 탭과 상태 칩(미반영 / 반영됨 / 반영됨(-x) / 제외)을 보여 준다
  - 체크해서 cherry-pick(확인 대화상자를 거친다)하거나 패치로 내보낸다
  - 행을 누르면 그래프에서 그 커밋을 보여 준다
  - 원격이 하나뿐이면 `git remote add upstream` 안내를 띄운다
- 여는 곳: 브랜치(로컬/원격) 우클릭 → "{현재 브랜치}에 없는 커밋 보기"
- 데모는 같은 요약 = 같은 패치로 근사한다. e2e 6번째 테스트(백포트 → 반영됨으로 바뀜 → 제외)가 이 흐름을 확인한다
- 실제 앱(Tauri) 실행 확인은 아직 하지 않았다. git 동작은 Rust 테스트 3개(분류, 제외/적용, 내보내기)로 확인했다

## 다음 단계

1. 앱 안에서 원격 추가 (백포트 시트의 터미널 안내를 대체)
2. M4 · 드래그로 interactive rebase
3. M5 · React Compiler 규칙 켜기 (setState-in-effect 8곳 정리)

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
  - 긴 직선 이력 만들기: `window.__otgitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
