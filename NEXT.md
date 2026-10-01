# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- PR [Jimoou/otgit#1](https://github.com/Jimoou/otgit/pull/1)을 squash merge했다(`e588fba`). CI는 3개 OS 모두 통과. 작업 브랜치는 `main`에서 다시 시작했다.
- push 팁: CI는 새 push가 오면 이전 실행을 취소한다(Windows 약 8분). CI 결과가 필요할 때는 push를 몰아서 한다.

## 지금 하는 일

M2 · 커밋 조작 + 우클릭 메뉴 완료 → PR #2에서 CI 대기

- 백엔드: `git/pick.rs`(cherry-pick `-x` / revert, 병합 커밋 `-m 1`), `commit(…, amend)`, `continue_op`
- UI: 노드 우클릭 `ContextMenu`(브랜치 만들기 `NameDialog` / 체크아웃 / cherry-pick / revert / amend / SHA 복사), ⌥ 드래그 cherry-pick(주황 케이블), 커밋 작성기 amend 모드(이미 push된 커밋이면 경고), 배너 계속/취소를 `IN_PROGRESS` 표로 일반화

## 다음 단계 (추천 순서)

1. PR #2 CI 통과 → squash merge → `main`에서 다시 시작
2. 브랜치 관리: 이름 변경 / 삭제, 태그 생성, 원격 브랜치 체크아웃(추적 브랜치), 브랜치 라벨 우클릭 메뉴(라벨 히트 테스트 필요)
3. 커밋 검색(메시지·작성자·SHA)과 그래프 하이라이트

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__otgit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__otgitDemo.failNextRemote = "https" | "ssh"`
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
