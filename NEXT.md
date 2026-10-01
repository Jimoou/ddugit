# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR #2(cherry-pick / revert / amend + 노드 우클릭 메뉴)를 squash merge했다(`a0bff0b`).
- 브랜치 관리 → PR #3
  - 백엔드: `git/refs.rs`, `RefOp` 태그 enum으로 이름 변경·삭제(`Unmerged` 상태)·태그·원격 체크아웃 처리, 테스트 33
  - UI: 그래프 배지 히트 테스트(`labelHits`, 렌더러가 매 프레임 채움), 배지와 사이드바 우클릭 `refMenu`, 병합 안 된 브랜치는 2단계 확인, `NameDialog`(초기값·메시지 필드)

## 다음 단계 (추천 순서)

1. PR #3 CI 통과 → squash merge → `main`에서 다시 시작
2. 커밋 검색(메시지·작성자·SHA)과 그래프 하이라이트, ⌘/Ctrl+F
3. hunk 단위 스테이징 (diff 시트에서 hunk 선택 → 부분 커밋)
4. 충돌 해결 화면

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.
- Stop 훅이 push하지 않은 커밋을 막는다. 그래서 PR CI가 도는 중에 다음 작업을 commit하면, CI 취소를 피하려면 그 PR이 merge될 때까지 commit을 미루거나 merge 후 rebase해서 push한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__otgit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__otgitDemo.failNextRemote = "https" | "ssh"`
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
