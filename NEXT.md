# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #25(dmg / exe 배포, 아이콘)를 squash merge했다(`d2a5ccf`). main에서 Release 워크플로를 수동 실행했다. artifact(dmg, exe)가 만들어지는지 확인한다.

## 지금 하는 일

영어 번역 PR A(기반) → CI 대기

- `src/i18n/`
  - `ko.ts`: 원본 사전, `Key` 타입
  - `en.ts`: `Record<Key, string>`, 그래서 빠진 키는 타입 오류
  - `index.ts`: `t()`, `setLocale`, `resolveLocale`, `localeTag`, `isKey`
  - `Rich.tsx`: `<b>`/`<code>` 표시를 요소로 바꾼다
- 언어는 설정 `language`(system/ko/en)에 저장한다. App이 불러올 때와 바꿀 때 `setLocale`을 부르고, 다시 렌더하면서 모든 화면이 바뀐다. 캔버스는 매 프레임 그리므로 따로 할 일이 없다
- Playwright는 `locale: "ko-KR"`로 고정했다. 그래서 기존 한국어 e2e가 그대로 돈다

## 다음 단계

1. i18n PR B: `App.tsx`(알림·확인 문구 136줄), Inspector, Composer, StashPanel
2. i18n PR C: BackportSheet, AuthDialog, ConflictSheet, DiffSheet, RebaseSheet, SyncDialog, `rebasePlan.ts`
3. (나중에) 서명, 자동 업데이트

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
