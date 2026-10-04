# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-02_

## 방금 끝난 것

- 창 제목 표시줄을 탭 줄로(#81). 첫 화면 이름 '내 저장소'.

## 지금 하는 일

v0.5.3 PR(첫 서명 릴리스: #80·#81·#82 + 서명 단계) → all_os → merge → Release(`release: true`) → `ddugit v0.5.3` 초안. macOS 서명·공증은 브랜치 테스트에서 이미 확인(공증 Accepted, 스테이플, dmg 안 앱 검증 통과).

## 결정 (2026-10-04)

- 오픈소스 아님, 저장소 비공개로 전환(사용자가 설정에서). GitHub Release로 배포하지 않고 별도 사이트·파일 저장소를 쓴다. Release 초안은 내부 보관용.

## 남은 것 (후보)

- 기능: `--rebase-merges`(병합이 섞인 구간 정리), 닫힌·병합된 PR 보기
- 성능(보류, 측정상 아직 불필요): 레이아웃 Web Worker·WebGL, diff 가상 스크롤
- 배포(사용자 준비물 필요): macOS 서명·공증, Windows 코드 서명 → 그다음 자동 업데이트(tauri-plugin-updater)
- 판매: 라이선스 공개키(`DDUGIT_LICENSE_PUBKEY`), Lemon Squeezy 상품·`BUY_URL`, 발급 웹훅

## 다음 단계

- 사용자가 할 일: v0.5.2 초안(.dmg·.exe 붙었는지) 확인 후 Publish(이전 초안 정리). 이미 추가한 upstream 원격은 ⋯ 메뉴에서 '보내기 막기'
- 다음 릴리스(v0.5.3 또는 v0.6.0)에 #80과 창 제목 표시줄이 들어간다

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
