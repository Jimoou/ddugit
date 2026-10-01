# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #39(그래프 작업 연출: 중력장, 병합 융합, cherry-pick 혜성, rebase 별자리)를 squash merge했다(`10ce8c6`).

## 지금 하는 일

게임 같은 연출 3단계(마지막) "충돌" → PR CI 대기

- `Fx.tsx`의 `Nebula`: 항상 마운트되어 있다(`.fx-clip` 안). 충돌 파일이 있으면 `.on`이 붙어 붉은 성운이 천천히 흐른다(14초 주기). 마지막 파일을 해결하면 `.on`이 빠지면서 transition으로 커지고 흐려지며 흩어진다
- 반짝임을 끄면(`still`) 움직임 없이 색만 남긴다
- e2e: 충돌 테스트에서 성운이 끼고, 두 번째 파일을 "파일 전체"로 해결하면 걷히는 것을 확인한다

## 다음 단계

1. M6가 끝난다. 다음은 M4 PR 연동(그래프에 PR 상태 표시). **토큰 방식 결정이 필요하다:** `gh auth token` 재사용 vs 키체인 저장. 사용자에게 묻는다
2. 제안 중: 첫 실행 튜토리얼(미션). 사용자 답을 기다린다
3. 사용자가 v0.1.0 초안 Release를 Publish해야 태그가 생긴다. M6가 끝났으니 v0.2.0 초안도 제안할 수 있다

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
