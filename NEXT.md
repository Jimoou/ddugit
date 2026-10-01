# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #19(React Compiler 린트 규칙, effect 안 setState 정리)를 squash merge했다(`74f7924`).

## 지금 하는 일

백포트 · 여러 대상 한눈에 보기 → PR #20에서 CI 대기 (10분 뒤 확인 예약)

- 설계 문제를 고쳤다. 제외 표시가 저장소 전체에 하나라서, 한 저장소에 고객사 브랜치가 여럿이면 한 곳에서 제외한 커밋이 다른 곳에서도 제외됐다
  - 이제 `otgit.<target>.backportIgnored`에 저장한다. git은 키를 첫 점과 마지막 점에서 자르므로 `/`나 `.`가 든 브랜치 이름도 subsection이 된다
  - 예전 키 `otgit.backportIgnored`도 계속 읽어서 모든 대상에 적용한다. 제외를 풀면 두 키에서 모두 지운다
- `backport_summary(path, source, targets)`: 대상마다 `compare`를 돌려 미반영/반영됨/제외 개수를 센다. 가져올 쪽 자신은 뺀다
- `BackportSheet`
  - 탭을 미반영 / 전체 / **대상별** 세 개로 늘렸다. 대상별 표는 로컬 브랜치를 미반영이 많은 순으로 보여 준다
  - 행을 누르면 그 브랜치가 받는 쪽이 되고 미반영 탭으로 돌아간다
- 데모 mock도 받는 쪽별로 제외를 기록한다. e2e 10번째 테스트가 확인한다

## 다음 단계

1. M5 · 설정 화면 (테마, 애니메이션, git 경로), 단축키 표
2. M5 · 키보드로 노드 이동(접근성)
3. M3 · 그래프 위에서 노드를 끌어 바로 rebase 순서 바꾸기

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
