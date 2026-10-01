# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #15(백포트 트래커)를 squash merge했다(`91920f1`).

## 지금 하는 일

앱 안에서 원격 추가·삭제 → PR #16에서 CI 대기 (10분 뒤 확인 예약)

- `RefOp::AddRemote { name, url }`, `RemoveRemote { name }` (`git remote add/remove`). 테스트는 로컬 저장소를 원격으로 추가하고 fetch한 뒤 삭제까지 확인한다
- 사이드바 "원격" 제목 옆에 ＋를 붙였다. 원격 브랜치가 하나도 없어도 그룹이 보인다
  - 이름과 URL을 받아 추가하고 바로 Fetch(`--all`)한다. 인증 실패는 기존 인증 안내 흐름을 탄다
- 원격 브랜치 우클릭 → "원격 X 삭제…" (확인을 거친다)
- `NameDialog`: `messagePlaceholder`를 `extra { placeholder, multiline, required }`로 일반화했다(태그 설명, 원격 URL)
- 백포트 시트의 터미널 안내를 "원격 추가…" 버튼으로 바꿨다
- 데모: 원격을 추가하면 `<name>/main`에 원본 쪽 수정 커밋 2개가 생긴다. e2e 7번째 테스트(원격 추가 → 백포트 목록)가 확인한다

## 다음 단계

1. M4 · 드래그로 interactive rebase (순서 바꾸기, squash)
2. M5 · React Compiler 규칙 켜기 (setState-in-effect 8곳 정리)
3. 백포트: 여러 대상 한눈에 보기 (고객사별 미반영 개수 표)

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
