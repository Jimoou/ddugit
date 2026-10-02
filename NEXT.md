# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-02_

## 방금 끝난 것

- v0.5.1 릴리스 초안, 새 "ddu" 아이콘(#77).
- v0.5.2 수정 PR: 브랜치 단순 클릭 토글, 원격 접기·'받기만' 뱃지, 은하 카드 ⋯, 고정 '내 은하' 탭(⌘/Ctrl+0), 빈 저장소에서 새 브랜치를 원격 브랜치에서 시작.

## 지금 하는 일

v0.5.2 버전 올림 PR(#78 merge 뒤) → CI · Rust all_os → merge → Release 수동 실행 → `ddugit v0.5.2` 초안.

## 다음 단계

- 사용자가 할 일: v0.5.2 초안 확인 후 Publish(이전 초안 v0.5.1·v0.5.0·…은 공개하거나 삭제). 이미 추가해 둔 upstream 원격은 ⋯ 메뉴에서 '보내기 막기'를 한 번 눌러야 가져오기 전용이 된다
- 사용자가 할 일: `scripts/license.mjs keygen` → `DDUGIT_LICENSE_PUBKEY` 변수, Apple Developer(개인)·Windows 인증서, Lemon Squeezy 상품과 `BUY_URL`
- 데스크톱에서 SSH·worktree·서브모듈·LFS·빈 저장소 새 브랜치 실제 확인
- 다음 마일스톤은 사용자와 정한다

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋과 커밋하지 않은 변경을 막으므로, PR CI가 도는 동안의 다음 작업은 `git stash`에 두거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
  - 회전한 채로 열기: `localStorage["ddugit.settings"] = '{"rotation":3}'`
  - 은하 대시보드: `localStorage["ddugit.recent"]`에 경로를 넣고(그룹은 항목의 `group` + `localStorage["ddugit.groups"]`) 새로고침 → 새 탭. 데모의 각 경로는 경로 해시로 만든 상태, `gone`이 든 경로는 찾을 수 없음
  - 데모에는 원격에만 있는 브랜치 `origin/feature/orbit-sync`가 있다
  - 데모에는 서브모듈 둘(하나는 초기화 안 됨)과 LFS(패턴 둘, 받지 않은 파일 셋)가 있다. worktree는 `api.worktree("demo", …)`로 추가
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- Rust 테스트의 git은 로컬 폴더 원격을 허용한다(`mod.rs` `command()`의 `#[cfg(test)]`, 서브모듈 테스트용).
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
