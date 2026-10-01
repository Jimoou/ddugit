# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-01_

## 지금 하는 일

M1 · fetch / pull / push + diff 보기

## 다음 단계 (순서대로)

1. 백엔드 `git.rs`
   - `remote(op)`: fetch / pull / push를 인자 테이블 하나로 처리
   - `HeadInfo`에 upstream, ahead, behind 추가
   - `commit_diff(id)`, `worktree_diff(path)` (libgit2)
   - 각각 bare 원격 저장소로 테스트
2. 프런트
   - 상단바 원격 버튼(↓ fetch, ⇣ pull, ⇡ push + ahead/behind 배지), pull 갈라짐 다이얼로그
   - `DiffSheet`: 그래프 아래에서 올라오는 diff 패널. 커밋 상세와 커밋 작성기의 파일 클릭으로 열림
3. 데모 모드(`mock.ts`)에 같은 기능 구현 → Playwright로 스크린샷 확인
4. ROADMAP 체크, 작업 기록 추가, 이 파일 갱신

## 막힌 것 / 결정 필요

- 원격 저장소에 `main` 브랜치가 아직 없습니다. 첫 PR의 base로 `main`을 만들어야 합니다(사용자 확인 필요).
- macOS / Windows 실행 확인은 CI(`cargo test`)로만 하고 있습니다. 실제 앱 실행은 사용자가 확인해야 합니다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg` (세션이 지정한 브랜치)
- 브라우저 데모: `npm run dev`. 개발 모드에서는 `window.__otgit.screenOf(id)`로 노드의 화면 좌표를 얻을 수 있습니다(e2e용).
