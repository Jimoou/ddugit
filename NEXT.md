# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #40(충돌 붉은 성운)을 squash merge했다(`5c118dc`). M6가 끝났다.
- 사용자 결정(2026-10-02)
  - PR 연동 토큰은 gh/glab 먼저, 없으면 키체인. M4 PR 연동부터 한다
  - **이름을 otgit에서 ddugit으로 바꾼다**(저장소도 `Jimoou/ddugit`). 저장소는 public으로 바꿨다
  - CI 절감 1·2·3을 적용한다

## 지금 하는 일

이름 변경 + CI 절감 → PR CI 대기

- 이름: 화면, 크레이트(`ddugit`, `ddugit_lib`), 패키지, `tauri.conf`(productName, identifier `com.ddugit.app`), 창 전역(`__ddugit`, `__ddugitDemo`), localStorage 키(`ddugit.*`), 데모(`ddugit-demo`), 문서
  - identifier가 바뀌어 앱 데이터 폴더가 달라진다. 0.1.0 빌드의 설정·최근 목록은 넘어오지 않는다(배포 전이라 이전하지 않았다)
  - 백포트 제외 config는 사용자 저장소에 남는 데이터다. 그래서 `ddugit.<target>.backportIgnored`에 쓰고, 예전 `otgit.<target>.backportIgnored`와 `otgit.backportIgnored`도 계속 읽고 지운다(테스트 추가)
  - git remote를 `https://github.com/Jimoou/ddugit`으로 바꿨다
- CI: `ci.yml`을 `ci-web.yml`과 `ci-rust.yml`로 나눴다. PR에서만 돌고, 경로 필터를 건다. Rust는 ubuntu만 돌고 macOS·Windows는 수동 `all_os`로 돌린다. 작업 단위마다 timeout을 둔다

## 다음 단계

1. M4 PR 연동: 코드는 `m4-pr` 로컬 브랜치(`acc1f8e`, origin 세션 브랜치에도 한때 push했다)에 있다. 이름 변경 뒤에 cherry-pick하고 `otgit` 문자열(키체인 서비스, User-Agent, 토큰 설명, 데모 URL, 테스트)을 ddugit으로 바꿔 PR을 연다
2. 제안 중: 첫 실행 튜토리얼(미션)
3. 사용자가 v0.1.0 초안 Release를 Publish해야 태그가 생긴다(이름이 바뀌었으니 다음 릴리스는 ddugit 이름으로 나간다)

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI(Web, E2E, Rust ×3)가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋을 막으므로, PR CI가 도는 동안에는 commit하지 않거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
