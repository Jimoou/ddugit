# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #37(파일 이력·blame)을 squash merge했다(`aff5c4d`).
- CI에서 bisect e2e가 또 빗나갔다. 이제 `demo.commitMenu(id)`가 메뉴 제목이 그 커밋 요약일 때까지 우클릭을 다시 시도한다. 커밋 우클릭이 필요한 새 테스트도 이것을 쓴다.

## 지금 하는 일

게임 같은 연출 1단계 "원격" → PR CI 대기

- `components/Fx.tsx`
  - `useFx(animate)`: `play(effect)`로 효과를 큐에 넣고 2.2초 뒤에 뺀다. 반짝임이 꺼져 있으면 아무것도 넣지 않는다
  - `FxLayer`가 그래프 위 `.fx-clip` 안에 그린다
  - 기존 노바·별가루·되감기 state 세 개를 여기로 합쳤다
- push 성공: HEAD에서 궤적(svg path가 그려짐)을 따라 혜성이 날아간다(`offset-path`). 점화 섬광이 함께 뜬다
- fetch·pull 성공: 작업 전 커밋 id와 `latest`(마지막으로 적용한 스냅샷 ref)를 비교한다. 새 커밋마다 유성이 떨어지고 충돌 섬광이 뜬다(최대 6개, 130ms 간격)
- 화면 좌표는 새 레이아웃이 그려지도록 80ms 뒤에 읽는다

## 다음 단계

1. 연출 2단계 그래프 작업: merge(끌면 대상 끝에 중력장, 놓으면 섬광), cherry-pick(혜성이 원본에서 새 커밋으로), rebase(별자리 재배열)
2. 연출 3단계 충돌: 붉은 성운, 해결하면 걷힘
3. 그다음 M4 PR 연동(토큰 방식 결정 필요: `gh auth token` 재사용 vs 키체인)
4. 제안 중: 첫 실행 튜토리얼(미션). 사용자 답을 기다린다
5. 사용자가 v0.1.0 초안 Release를 Publish해야 태그가 생긴다

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
