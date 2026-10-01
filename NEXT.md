# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

M1 핵심 완료: fetch/pull/push, ahead/behind 배지, 갈라짐·거부 처리 다이얼로그, diff 시트(커밋/작업 트리).
실제 Tauri 앱(Linux, Xvfb)에서 diff 표시와 push까지 확인했다. macOS/Windows는 CI의 `cargo test`로만 검증한다.

## 다음 단계 (추천 순서)

1. **M1 마무리**
   - 원격 작업 진행률: `git … --progress` stderr를 줄 단위로 읽어 Tauri 이벤트로 보내고, 상단바 버튼에 진행 바 표시
   - 인증 실패 안내: 출력에서 `Authentication failed`, `Permission denied (publickey)`를 감지해 해결 방법 다이얼로그 표시
2. **M2 시작 후보**: 변경 버리기 / stash (작업 트리 diff 시트 위에 버튼을 두면 자연스러움), 우클릭 메뉴
3. `main` 브랜치를 만들고 첫 PR 올리기 (사용자 확인 필요)

## 막힌 것 / 결정 필요

- 원격 저장소에 `main` 브랜치가 아직 없다. 지금까지의 작업은 모두 세션 브랜치에 있다.
- 인증: GUI에서는 터미널 프롬프트를 막아 두었다(`GIT_TERMINAL_PROMPT=0`, stdin 닫음). HTTPS는 credential helper(macOS 키체인, Windows GCM)가 있어야 하고, SSH는 agent나 암호 없는 키가 있어야 동작한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`. e2e 좌표는 `window.__otgit.screenOf(id)`(개발 모드 전용), 데모 상태는 `import("/src/mock.ts")`로 볼 수 있다.
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다. Pull 갈라짐을 시연하는 용도다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- 셸에서 `pkill -f "vite --port 1420"`을 쓰면 그 셸 자신까지 매칭돼 죽는다. `pkill -f "[v]ite --port 1420"`을 쓴다.
