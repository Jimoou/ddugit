# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #36(bisect)을 squash merge했다(`d995819`). CI가 `playwright install --with-deps`(apt)에서 30분 넘게 멈춰 있어서 취소하고 다시 돌렸다. 그래서 e2e 단계에 `timeout-minutes`(설치 8분, 테스트 15분)를 붙였다.

## 지금 하는 일

M6 고급 git 마지막 "파일 이력·blame" → PR CI 대기

- Rust `git/history.rs`
  - `file_log(rev, file)`: `git log --follow --name-only`로 커밋마다 그때의 경로를 얻는다. libgit2에는 follow가 없어서 CLI로 읽는다
  - `blame(rev, file)`: libgit2 `blame_file(newest_commit)`로 hunk마다 커밋·작성자·시각·요약을 낸다. 내용은 그 커밋의 blob에서 읽는다
- 화면
  - Inspector의 변경 파일을 우클릭하면 "이 파일이 지나온 커밋 보기"와 "blame"이 나온다. 이력은 그 커밋이 HEAD에 닿으면 HEAD부터 읽는다
  - 그래프 `trail`(renderer `drawTrail`): 금빛 점선 별자리, 각 커밋에 반짝이는 십자, 옛것→최근으로 흐르는 혜성. 다른 커밋은 focus로 흐리게 한다
  - 배너: 더 최근 / 더 예전 / 줄마다 보기 / 닫기
  - `components/History.tsx`의 `BlameSheet`: 줄 묶음마다 별 색(`ageColor`: 붉을수록 오래됨, 푸를수록 최근). 왼쪽을 누르면 그 커밋으로 간다. Esc로 닫는다
- 데모: `filesOf(id)`(commit_diff와 공유)로 파일을 바꾼 커밋을 고르고, blame은 커밋마다 줄 묶음 하나씩 만든다

## 다음 단계

1. 기존 기능의 게임 같은 연출: 원격(push 궤적, pull·fetch 유성) → 그래프 작업(merge 중력장·섬광, cherry-pick 혜성, rebase 별자리) → 충돌(붉은 성운)
2. 그다음 M4 PR 연동(토큰 방식 결정 필요: `gh auth token` 재사용 vs 키체인)
3. 제안 중: 첫 실행 튜토리얼(미션). 사용자 답을 기다린다
4. 사용자가 v0.1.0 초안 Release를 Publish해야 태그가 생긴다

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
