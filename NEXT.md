# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #23(Shift+끌기로 커밋 순서 옮기기)을 squash merge했다(`0755c5e`).
- 사용자 결정(2026-10-01)
  1. 밝은 테마는 만들지 않는다. 대신 **은하계 스타일**로 간다. 그래프 네온과 옷깃 브랜드는 그대로 두고, 기능 버튼에서 네온을 빼서 가독성을 높인다
  2. **영어 번역** 필요
  3. 서명과 자동 업데이트는 **나중에**
  4. 배포는 **dmg / exe**로 한다. Tauri 번들러가 그대로 만든다

## 지금 하는 일

은하계 스타일 → PR #24에서 CI 대기 (10분 뒤 확인 예약)

- `graph/space.ts`: 캔버스 배경
  - 깊은 그라디언트에 성운 세 개(시차 0.02)를 깔고, 별 타일 세 겹을 미리 그려 둔다(시차 0.04/0.1/0.2)
  - 반짝이는 별 12개는 ✦가 켜져 있을 때만 깜빡인다. 점 격자는 없앴다
- CSS
  - 새 토큰: `--space` `--glass` `--glass-strong` `--text-2` `--ui` `--ui-hover` `--ui-soft` `--ui-text` `--focus` `--ok` `--danger`
  - 조작 요소에서 네온 그라디언트와 발광을 걷어냈다. primary 버튼은 보라 단색에 흰 글자, 켜짐 상태는 채운 배경으로 보여 준다
  - eyebrow 글자는 `--text-2`, 토스트는 왼쪽 색 막대로 구분한다. topbar, sidebar, panel은 유리 표면(blur)으로 바꿨다
- CONVENTIONS §5에 "네온은 그래프와 데이터 전용" 규칙을 적었다

## 다음 단계

1. 배포 설정: `bundle.targets = ["dmg", "nsis"]`, 태그를 push하면 Release에 dmg/exe를 올리는 워크플로(서명 없음)
2. 영어 번역(i18n): 문자열 사전 + 언어 설정. PR을 여러 개로 나눈다(기반 → 화면별)

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
