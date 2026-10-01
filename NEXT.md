# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 방금 끝난 것

- `main`을 골격 커밋(`9ed21fa`)으로 만들고 첫 PR [Jimoou/otgit#1](https://github.com/Jimoou/otgit/pull/1)을 올렸다. 세션이 PR 이벤트를 구독하고 있다.
- **M1 완료**
  - 원격 작업 진행률: `--progress` stderr를 스트리밍해서(`git_streaming`) 파싱하고, Tauri `Channel`로 보내 버튼 안에 진행 바로 표시
  - 인증 실패: `OpStatus::Auth`로 분류하고 `AuthDialog`에서 HTTPS/SSH × macOS/Windows/Linux별 설정 단계를 보여준 뒤 다시 시도

## 지금 하는 일

M2 진행 중. discard와 stash 완료.

- 백엔드: `git/stash.rs`
- UI: 커밋 작성기의 "스태시에 보관" / "선택 버리기"(확인 다이얼로그), 그래프의 스태시 마커(기준 커밋 오른쪽 아래 마름모, 클릭하면 `StashPanel`), 사이드바 스태시 목록

## 다음 단계 (추천 순서)

1. PR #1 CI 이벤트가 오면 그것부터 처리
2. 우클릭 컨텍스트 메뉴 (노드: 브랜치 만들기 / 체크아웃 / cherry-pick / revert, 브랜치 라벨: 체크아웃 / 이름 변경 / 삭제). M2의 브랜치 관리 항목과 묶어서 진행
3. amend, revert, cherry-pick 백엔드

## 막힌 것 / 결정 필요

- 세션은 지정 브랜치에만 push할 수 있다. 그래서 PR #1이 merge되기 전에 하는 작업은 같은 PR에 커밋으로 쌓인다. PR #1을 merge하면 다음 작업은 `main`에서 브랜치를 새로 시작한다.
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
