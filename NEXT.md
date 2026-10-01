# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #34(브랜치 정리, 별가루 연출)를 squash merge했다(`a874e36`).

## 지금 하는 일

M6 고급 git 3단계 "과거 커밋 손보기" → PR CI 대기

- Rust `git/edit.rs`
  - `edit_commit(id, CommitEdit)`: 부모부터 `rebase -i --autostash`(뿌리 커밋이면 `--root`). todo는 전부 pick하고, 대상 뒤에 `exec` 한 줄을 넣는다
    - reword: `commit --amend --only -F 파일`
    - author: `--author='..'`
    - split: `reset HEAD~1` → 고른 파일 add·commit → 나머지 add·commit
  - 메시지는 `.git/otgit-edit/`의 파일로 넘기고, sh 인용은 `q()`로 한다
  - `restore_file(source, file)`: 그 커밋에 파일이 있으면 checkout, 없으면 rm. 결과는 스테이지된 변경이다
  - serde: `tag = "kind"`, `rename_all_fields = "camelCase"`
- 화면
  - 커밋 우클릭 "메시지 고치기…/작성자 바꾸기…/커밋 나누기…": 현재 브랜치 일직선 위이고 병합 커밋이 아닐 때만 켜진다
  - `EditCommitDialog`: 다시 쓰는 커밋 수와 push 경고를 연 순간에 계산한다(`isAncestor`가 ref 캐시라서 렌더 중에 못 부른다)
  - Inspector 변경 파일 우클릭: 이 커밋 상태로 / 이전 상태로
- 연출: 손본 커밋 자리에 `.nova`(빛의 고리 두 겹, 1초)

## 다음 단계 (M6 순서, ROADMAP 참고)

1. 고급 git 작업 마지막: bisect(그래프에서 좋음/나쁨 클릭)·파일 이력·blame. 각 기능에 맞는 우주 연출을 함께 넣는다
2. 기존 기능의 게임 같은 연출: 원격(궤적·유성) → 그래프 작업(중력장·혜성·별자리) → 충돌
3. 그다음 M4 PR 연동(토큰 방식 결정 필요: `gh auth token` 재사용 vs 키체인)
4. 제안 중: 첫 실행 튜토리얼(미션). 사용자 답을 기다린다

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
