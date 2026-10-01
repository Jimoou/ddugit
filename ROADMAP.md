# ROADMAP (누적형)

> **누적형 문서입니다.** 항목은 지우지 않고 체크만 합니다. 범위가 바뀌면 ~~취소선~~과 이유를 남깁니다.
> 맨 아래 **작업 기록**에는 한 작업 단위가 끝날 때마다 한 줄씩 **추가만** 합니다.
> 지금 무엇을 하고 있는지는 [NEXT.md](NEXT.md)를 봅니다.

## M0 · 기반 ✅

- [x] Tauri 2 + React + TS 골격, 데모 모드(가상 저장소)
- [x] 백엔드: 스냅샷(이력, 참조, 상태), commit(선택 파일), merge `--no-ff`/abort, checkout, branch
- [x] 레인 레이아웃 (trunk = 0번 레인, 브랜치 색 고정)
- [x] 네온 Canvas 렌더러: 발광 선, 반짝임 흐름, 시맨틱 줌, 커서 기준 줌, 미니맵
- [x] HEAD 다음 ＋ 노드 → 커밋 작성기 / 끌어서 병합
- [x] `otgit <경로>` 실행 인자

## M1 · 원격과 diff ✅

- [x] 개발 워크플로우: CLAUDE.md, CONVENTIONS.md, ROADMAP/NEXT, CI(3개 OS), PR 템플릿, Prettier/rustfmt
- [x] fetch / pull / push (+ upstream 없으면 `-u origin <branch>`), ahead/behind 표시
- [x] pull 갈라짐 처리: ff-only 실패 시 merge/rebase 선택
- [x] diff 보기: 커밋 diff(첫 부모 기준), 작업 트리 파일 diff
- [x] push 거부 시 fetch 후 병합/리베이스하고 다시 push, 리베이스 충돌 시 계속/취소
- [x] 원격 작업 진행률 표시 (`--progress` 파싱)
- [x] 인증 실패 시 안내 (credential helper / SSH agent 설정 가이드)

## M2 · 일상 작업 완성 ✅

- [x] hunk 단위 스테이징 (diff 시트 "변경 / 스테이지됨" 탭, hunk마다 스테이지·내리기, 스테이지된 것만 커밋)
- [x] 줄 단위 스테이징 (diff 줄 번호를 눌러 고르기, Shift로 범위, 내리기도 같은 방식)
- [x] 변경 버리기(discard), stash 저장·적용·꺼내기·삭제 (그래프에 기준 커밋 옆 마름모로 표시)
- [x] amend, revert, cherry-pick (⌥/Alt를 누른 채 끌어 놓으면 cherry-pick, `-x`로 원본 기록)
- [x] 브랜치 이름 변경 / 삭제(병합 안 됐으면 한 번 더 확인), 태그 생성·삭제, 원격 브랜치 체크아웃(추적 브랜치 생성)
- [x] 충돌 해결 화면: 블록마다 현재 쪽 / 들어오는 쪽 / 둘 다, 파일 전체 선택, 바이너리, 리베이스 시 라벨 반전
- [x] 충돌 해결: 직접 편집 (블록 안 텍스트 수정)
- [x] 진행 중인 병합 / cherry-pick / revert를 그래프에 표시 (들어오는 커밋 → ＋ 빨간 점선)
- [x] 커밋 검색 (메시지, 작성자, SHA, 브랜치 이름), 그래프에서 하이라이트 · ⌘/Ctrl+F, Enter로 결과 이동
- [x] 우클릭 컨텍스트 메뉴: 커밋 노드
- [x] 우클릭 컨텍스트 메뉴: 브랜치 라벨(그래프 배지) · 사이드바 목록

## M3 · 대형 저장소와 성능 🚧

- [x] 이전 이력 더 불러오기 (그래프 왼쪽 끝 "⋯ 이전 이력 더 불러오기", 3000개씩, 카메라 위치 유지)
- [x] 파일 감시(notify)로 자동 새로고침 (`.gitignore`된 경로와 `.git/objects` 등은 무시, 300ms 디바운스)
- [x] 시맨틱 줌 확장: 일직선 구간을 막대로 접기 (50% 미만에서 4개 이상 직선 구간 → 개수 막대, 누르면 펼쳐 확대)
- [x] 라벨 겹침 회피 (인접 노드의 브랜치 배지가 가로로 겹침)
- [ ] 레이아웃 Web Worker 이동, 필요하면 WebGL 렌더러
- [ ] diff 가상 스크롤 (큰 파일)

## M4 · 차별화

- [ ] 멀티 레포 백포트 트래커 (원본 ↔ 고객사 레포, 미반영 커밋 목록, cherry-pick/patch 내보내기)
- [ ] 드래그로 interactive rebase (순서 바꾸기, squash)
- [ ] GitHub / GitLab PR 연동 (그래프에 PR 상태 표시)

## M5 · 배포 품질

- [ ] macOS 서명 + 공증, Windows 코드 서명
- [ ] 자동 업데이트 (tauri-plugin-updater)
- [ ] 설정 화면 (테마, 애니메이션, git 경로), 단축키 표
- [ ] i18n (영어), 접근성 (키보드로 노드 이동, 스크린리더 라벨)
- [ ] ESLint, Playwright e2e를 CI에 추가

---

## 작업 기록 (append-only)

| 날짜       | 내용                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | M0 완료: 골격, git 백엔드(테스트 6), 레이아웃(테스트 8), 네온 렌더러, ＋ 커밋, 끌어서 병합, 미니맵                                                                                                                    |
| 2026-10-01 | 워크플로우 도입: CLAUDE.md / CONVENTIONS.md / ROADMAP / NEXT, CI(ubuntu·macos·windows), Prettier·rustfmt                                                                                                              |
| 2026-10-01 | M1: fetch/pull/push(+ahead/behind, 갈라짐·거부 처리), diff 시트(커밋/작업 트리), git 모듈 분리(테스트 17)                                                                                                             |
| 2026-10-01 | `main` 생성(골격 커밋), 첫 PR #1. M1 완료: 원격 진행률(`--progress` → Tauri Channel), 인증 실패 분류 + OS별 안내 다이얼로그(테스트 20)                                                                                |
| 2026-10-01 | M2: discard(확인 필수) + stash push/apply/pop/drop, 그래프 스태시 마커·패널·사이드바, ChangedFiles/format 공통화(테스트 25)                                                                                           |
| 2026-10-01 | PR #1 squash merge(`e588fba`). M2: cherry-pick/revert(`git/pick.rs`)/amend, 노드 우클릭 메뉴, ⌥ 드래그 cherry-pick, 배너 계속/취소 일반화(테스트 29)                                                                  |
| 2026-10-01 | PR #2 squash merge(`a0bff0b`). M2: 브랜치·태그 관리(`git/refs.rs`, `RefOp` 표 하나), 배지/사이드바 우클릭 메뉴, `NameDialog` 일반화(테스트 33)                                                                        |
| 2026-10-01 | PR #3 squash merge(`0db48ef`). M2: 커밋 검색(`graph/search.ts` + vitest 5, `SearchBar`, 일치 항목만 밝게 표시). PR 운영: GitGuardian 때문에 완료 이벤트가 오지 않아 10분 뒤 확인 예약으로 전환                        |
| 2026-10-01 | PR #4 squash merge(`021d5c5`). M2: hunk 스테이징(`git/stage.rs`: 패치에서 hunk 골라 `git apply --cached`), `DiffScope`(all/unstaged/staged), `commit_index`(테스트 37)                                                |
| 2026-10-01 | PR #5 squash merge(`3c20d93`). M2: 충돌 해결(`git/conflict.rs`, `src/conflict.ts` 마커 파서 + vitest 6, `ConflictSheet`, 충돌이 나면 자동으로 열림)(테스트 40)                                                        |
| 2026-10-01 | PR #6 squash merge(`6f8978a`, Windows CRLF 테스트 수정 포함). 그래프에 진행 중 병합 표시(`incoming`, MERGE/CHERRY_PICK/REVERT_HEAD), 알림 위치를 아래로(테스트 41)                                                    |
| 2026-10-01 | PR #7 squash merge(`fed643f`). M3: 이전 이력 더 불러오기(그래프 꼬리 버튼, `limit` 상태, 레이아웃이 바뀌어도 최신 커밋 기준으로 카메라 고정, 불러온 이력에는 반짝임 효과 없음)                                        |
| 2026-10-01 | PR #8 squash merge(`fd705ac`). M3: 파일 감시(`git/watch.rs`, notify-debouncer-mini, `repo-changed` 이벤트), 실제 앱에서 터미널 커밋이 바로 반영되는 것 확인(테스트 43)                                                |
| 2026-10-01 | PR #9 squash merge(`f440e4b`). M3: 라벨 겹침 회피(`graph/labels.ts` `placeBadges`: HEAD 우선, 겹치면 위로 올리고 연결선, 그래도 안 되면 "+N" 칩)(vitest 24)                                                           |
| 2026-10-01 | PR #10 squash merge(`3f4e8f7`). M2 마무리: 줄 단위 스테이징(`select_lines`: 고르지 않은 `-`는 문맥으로, `+`는 버림, 내리기는 반대), 충돌 블록 직접 편집(줄바꿈 보존), 알림을 그래프 영역 안으로(테스트 47, vitest 25) |
| 2026-10-01 | PR #11 squash merge(`d3461b1`). M3: 일직선 구간 접기(`graph/runs.ts` `straightRuns`, ref·HEAD·stash·병합 대기 커밋은 접지 않음, 검색 중이거나 선택된 구간은 펼친 채로), 데모 `__otgitDemo.grow(n)`(vitest 28)         |
