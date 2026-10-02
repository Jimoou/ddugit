# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-02_

## 방금 끝난 것

- M8+ 우주 제어 시스템 스타일 merge(`0f93552`).
- M9 결정(ROADMAP M9): 개인 무료 + 상업용 유료, Lemon Squeezy, 개인 이름 서명, 다음 기능은 은하 대시보드·서브모듈/LFS/worktree.

## 지금 하는 일

M9-1 보안 보강 merge(`2d07b5e`). M9-2 원격 작업 확인 merge(`43ca6c9`). M9-3 백포트 merge(`fc22eb1`). M9-4 SSH PR → CI 대기. 이어서 M9-3 백포트 찾기 쉽게, M9-4 SSH, M9-5 라이선스·서명 준비.

## 다음 단계

- 확인 창: pull/push 기본 켬, fetch는 읽기만 하므로 기본 끔(설정에서 켤 수 있음). 보낼/받을 커밋 목록, "다시 묻지 않기"
- 백포트: 사이드바 브랜치 섹션 머리에 진입 버튼, 시트 상단에 사용법 안내, 메뉴 이름을 분명하게
- SSH: Rust에 `ssh_status`(키·에이전트), `ssh_keygen`, `ssh_host_key`(keyscan 지문 + 알려진 지문 비교)·`ssh_trust_host`(known_hosts에 추가), `ssh_test`. clone 창과 인증 창에서 사용
- 라이선스: 공개키를 앱에 넣고 서명 파일을 오프라인 검증. 발급 서버는 문서로 설계(코드는 저장소 밖)

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
  - 회전한 채로 열기: `localStorage["ddugit.settings"] = '{"rotation":3}'`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
