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

## M2 · 일상 작업 완성 🚧

- [ ] hunk / 줄 단위 스테이징
- [x] 변경 버리기(discard), stash 저장·적용·꺼내기·삭제 (그래프에 기준 커밋 옆 마름모로 표시)
- [ ] amend, revert, cherry-pick (점을 끌어 다른 브랜치에 놓을 때 수정키로 선택)
- [ ] 브랜치 이름 변경 / 삭제, 태그 생성, 원격 브랜치 체크아웃(추적 브랜치 생성)
- [ ] 충돌 해결 화면 (ours / theirs / 수동 편집, 3-way)
- [ ] 커밋 검색 (메시지, 작성자, SHA), 그래프에서 하이라이트
- [ ] 우클릭 컨텍스트 메뉴 (노드, 브랜치 라벨)

## M3 · 대형 저장소와 성능

- [ ] 이전 이력 더 불러오기 (현재 3000개 제한)
- [ ] 파일 감시(notify)로 자동 새로고침 (현재는 창 포커스 시에만)
- [ ] 시맨틱 줌 확장: 일직선 구간을 막대로 접기
- [ ] 라벨 겹침 회피 (인접 노드의 브랜치 배지가 가로로 겹침)
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

| 날짜       | 내용                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | M0 완료: 골격, git 백엔드(테스트 6), 레이아웃(테스트 8), 네온 렌더러, ＋ 커밋, 끌어서 병합, 미니맵                                     |
| 2026-10-01 | 워크플로우 도입: CLAUDE.md / CONVENTIONS.md / ROADMAP / NEXT, CI(ubuntu·macos·windows), Prettier·rustfmt                               |
| 2026-10-01 | M1: fetch/pull/push(+ahead/behind, 갈라짐·거부 처리), diff 시트(커밋/작업 트리), git 모듈 분리(테스트 17)                              |
| 2026-10-01 | `main` 생성(골격 커밋), 첫 PR #1. M1 완료: 원격 진행률(`--progress` → Tauri Channel), 인증 실패 분류 + OS별 안내 다이얼로그(테스트 20) |
| 2026-10-01 | M2: discard(확인 필수) + stash push/apply/pop/drop, 그래프 스태시 마커·패널·사이드바, ChangedFiles/format 공통화(테스트 25)            |
