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
  - 측정(2026-10-01, 보류): 커밋 18,000개·레인 47개에서 `computeLayout` 35ms, `buildScene` 78ms(한 번만 실행). 데모 3,000개를 접기 없이(검색 중) 8% 배율로 그려도 60fps. 지금은 Worker가 필요 없다. 실제 대형 저장소에서 느리면 다시 본다
- [ ] diff 가상 스크롤 (큰 파일)
  - 보류: 백엔드가 파일당 3,000줄, 전체 20,000줄로 자르고, 화면에는 고른 파일 하나만 그린다. 그 이상을 보여 줄 필요가 생기면 한다

## M4 · 차별화

- [x] 멀티 레포 백포트 트래커 (원본 ↔ 고객사 레포, 미반영 커밋 목록, cherry-pick/patch 내보내기)
  - 다른 저장소는 원격으로 추가해 비교한다(`git remote add upstream …`). 브랜치 우클릭 → "…에 없는 커밋 보기"
  - [x] 앱 안에서 원격 추가 (사이드바 원격 ＋, 추가 후 바로 Fetch) · 원격 브랜치 우클릭으로 원격 삭제
  - [x] 여러 대상 한눈에 보기 (고객사가 여럿일 때 브랜치별 미반영 개수 표) · 제외는 받는 쪽마다 따로
- [x] 드래그로 interactive rebase (순서 바꾸기, squash) — 커밋 우클릭 → "이 다음 커밋들 정리", 목록 끌어서 순서 · 유지/합치기/버리기
  - [x] 그래프 위에서 노드를 끌어 바로 순서 바꾸기 (Shift+끌기 → 옮긴 계획으로 정리 화면이 열림)
  - [ ] 병합이 섞인 구간(`--rebase-merges`)
  - [x] 정리한 뒤 강제 push: Push 거부 화면에 "덮어쓰기"(`--force-with-lease`)
- [ ] GitHub / GitLab PR 연동 (그래프에 PR 상태 표시)

## M5 · 배포 품질

- [ ] (나중에) macOS 서명 + 공증, Windows 코드 서명 — 2026-10-01 결정: 뒤로 미룸. Apple Developer 계정, Windows 인증서가 필요하다
- [ ] (나중에) 자동 업데이트 (tauri-plugin-updater) — 2026-10-01 결정: 뒤로 미룸. 서명과 배포 위치를 정한 뒤에 한다
- [x] 배포 파일: macOS `.dmg`, Windows `.exe`(NSIS 설치 파일). 2026-10-01 결정. Tauri 번들러가 둘 다 만든다. 태그를 push하면 Release에 올리는 워크플로를 만든다(서명 전에는 첫 실행 경고가 뜬다)
- [x] 설정 화면 (테마, 애니메이션, git 경로), 단축키 표 — 반짝임, 한 번에 불러올 커밋 수, git 실행 파일(`--version`으로 확인 후 적용), 단축키 표, `?`/⚙로 열기
  - [ ] 테마 (지금은 네온 다크 하나) — 2026-10-01 결정: 밝은 테마는 만들지 않는다
  - [x] 은하계 스타일: 그래프 배경에 성운과 별 세 겹(시차), 조작 요소는 네온 대신 유리 표면 + 차분한 보라 강조(가독성), 탑바·사이드바는 검정. 그래프 네온과 브랜드는 그대로
- [x] i18n (영어), 접근성 (키보드로 노드 이동, 스크린리더 라벨)
  - [x] 접근성: ←→ 부모/자식, ↑↓ 옆 레인, Enter 메뉴, 선택한 커밋을 aria-live로 읽어 줌, 캔버스 포커스 가능
  - [x] i18n (영어): 모든 화면. 설정에서 시스템/한국어/English
    - [x] 기반: `src/i18n`(사전, `t()`, `<Rich>`), 언어 설정(시스템/한국어/English), 탑바·사이드바·검색·다이얼로그·설정·그래프 위 글자
    - [x] App 알림·메뉴·확인 문구, Inspector·Composer·StashPanel
    - [x] 시트(Backport, Conflict, Diff, Rebase), Auth·Sync 다이얼로그, `rebasePlan`
- [x] ESLint, Playwright e2e를 CI에 추가
  - [x] Playwright e2e: 데모 모드 대상 5개 흐름(커밋, 드래그 병합, 충돌 직접 편집, 줄 스테이징, 직선 구간 접기), CI `E2E` 잡
  - [x] ESLint: typescript-eslint 권장 + react-hooks(`rules-of-hooks`, `exhaustive-deps`) + effect 식 본문 금지. CI Web 잡에서 실행
  - [x] react-hooks v7의 React Compiler 규칙(`set-state-in-effect` 등) 켜기. 지금 코드에서 8곳이 걸린다(prop이 바뀔 때 상태를 초기화하는 effect). `key`로 리셋하거나 렌더 중에 조정하는 방식으로 옮겨야 한다

## M6 · 우주와 연결 (PR 연동 전에) — 2026-10-01 사용자 결정

PR 연동(M4)보다 먼저 한다. 순서대로 진행한다.

- [x] 우주 다듬기: 그래프 이동 범위 제한(무한맵 → 그래프가 화면 밖으로 사라지지 않음, `graph/camera.ts`), 하늘이 10분에 한 바퀴 천천히 회전(반짝임 효과가 켜져 있을 때), 브랜드 옆 "옷깃" 문구 삭제
- [x] 저장소 연결 방법: URL로 clone(진행률, 인증 실패 시 기존 안내), 최근 저장소 목록·즐겨찾기, 새 저장소 만들기(init), 폴더 끌어다 놓기 — 탑바 저장소 이름 ▾ 메뉴와 첫 화면
- [x] 멀티탭: 저장소 여러 개를 탭으로 열기(탭마다 그래프·패널 상태 유지, 파일 감시는 보이는 탭만) — ⌘/Ctrl+T·W·1…9, Ctrl+Tab, 다시 켜면 열려 있던 탭 복원, 탭 전환 워프
- [ ] 고급 git 작업을 간편 기능으로
  - [x] 실수 되돌리기: 마지막 커밋 취소, 이 커밋으로 되돌리기(soft/mixed/hard), reflog로 잃어버린 커밋·지운 브랜치 복구 — 커밋 우클릭, 탑바 ⏱ 되돌리기 기록, 되돌릴 때 시간을 감는 연출
  - [x] 브랜치 정리: 병합 끝난 로컬 브랜치 일괄 삭제, 원격에서 사라진 브랜치 정리(prune), 오래된 브랜치 목록 — 사이드바 "브랜치" 옆 ✧, 지운 브랜치 끝이 별가루로 흩어짐
  - [x] 과거 커밋 손보기: 메시지 고치기(reword), 작성자 바꾸기, 커밋 둘로 나누기, 파일 하나만 특정 커밋 상태로 — 커밋 우클릭, 변경 파일 우클릭, 손본 커밋에 노바(빛의 고리) 연출
  - [x] 추적·조사: 그래프에서 bisect(좋음/나쁨 클릭), 파일 이력·blame
    - [x] bisect: 커밋 우클릭으로 범위 고르기, 배너에서 버그 있음/없음/건너뛰기, 후보 밖은 흐리게, 지금 확인할 커밋에 망원경 조준선, 범인에 붉은 노바
    - [x] 파일 이력·blame: 변경 파일 우클릭 → 그 파일을 바꾼 커밋을 금빛 별자리로 잇고(이름 바뀜 추적, 혜성이 옛것→최근으로 흐름) 나머지는 흐리게, 배너에서 더 최근/더 예전으로 이동. blame 시트는 줄 묶음마다 별 색(붉을수록 오래됨, 푸를수록 최근), 누르면 그 커밋으로
- [ ] 게임 같은 우주 연출 (기능마다, 반짝임 효과를 끄면 정적으로)
  - [x] 원격: push는 HEAD에서 쏘아 올리는 궤적과 혜성, pull·fetch는 새로 들어온 커밋마다 떨어지는 유성과 충돌 섬광 (진행률은 탑바 버튼에 그대로 둔다: 조작 요소는 차분하게). 연출은 `components/Fx.tsx`의 효과 큐 하나로 모았다
  - [x] 그래프 작업: 끌어서 유효한 대상 위에 오면 중력장(돌며 빨려드는 점선 고리, 병합·cherry-pick·순서 옮기기 공통), 병합은 두 별이 합쳐지는 섬광과 충격파, cherry-pick은 원본에서 새 커밋으로 혜성, rebase는 다시 쌓인 커밋을 별자리로 잇고 하나씩 반짝임. 위치는 카메라가 멈춘 뒤(rAF 세 프레임 같을 때) 읽는다
  - [ ] 충돌은 붉은 성운 경고, 해결하면 걷힘 · 되돌리기(reset/reflog)는 시간을 감는 효과 · 탭 전환은 워프
  - 원칙: 조작 요소는 지금처럼 차분하게(가독성), 연출은 그래프 캔버스와 결과 순간에만. `prefers-reduced-motion`과 반짝임 설정을 따른다

---

## 작업 기록 (append-only)

| 날짜       | 내용                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-01 | M0 완료: 골격, git 백엔드(테스트 6), 레이아웃(테스트 8), 네온 렌더러, ＋ 커밋, 끌어서 병합, 미니맵                                                                                                                                                                                                                                                     |
| 2026-10-01 | 워크플로우 도입: CLAUDE.md / CONVENTIONS.md / ROADMAP / NEXT, CI(ubuntu·macos·windows), Prettier·rustfmt                                                                                                                                                                                                                                               |
| 2026-10-01 | M1: fetch/pull/push(+ahead/behind, 갈라짐·거부 처리), diff 시트(커밋/작업 트리), git 모듈 분리(테스트 17)                                                                                                                                                                                                                                              |
| 2026-10-01 | `main` 생성(골격 커밋), 첫 PR #1. M1 완료: 원격 진행률(`--progress` → Tauri Channel), 인증 실패 분류 + OS별 안내 다이얼로그(테스트 20)                                                                                                                                                                                                                 |
| 2026-10-01 | M2: discard(확인 필수) + stash push/apply/pop/drop, 그래프 스태시 마커·패널·사이드바, ChangedFiles/format 공통화(테스트 25)                                                                                                                                                                                                                            |
| 2026-10-01 | PR #1 squash merge(`e588fba`). M2: cherry-pick/revert(`git/pick.rs`)/amend, 노드 우클릭 메뉴, ⌥ 드래그 cherry-pick, 배너 계속/취소 일반화(테스트 29)                                                                                                                                                                                                   |
| 2026-10-01 | PR #2 squash merge(`a0bff0b`). M2: 브랜치·태그 관리(`git/refs.rs`, `RefOp` 표 하나), 배지/사이드바 우클릭 메뉴, `NameDialog` 일반화(테스트 33)                                                                                                                                                                                                         |
| 2026-10-01 | PR #3 squash merge(`0db48ef`). M2: 커밋 검색(`graph/search.ts` + vitest 5, `SearchBar`, 일치 항목만 밝게 표시). PR 운영: GitGuardian 때문에 완료 이벤트가 오지 않아 10분 뒤 확인 예약으로 전환                                                                                                                                                         |
| 2026-10-01 | PR #4 squash merge(`021d5c5`). M2: hunk 스테이징(`git/stage.rs`: 패치에서 hunk 골라 `git apply --cached`), `DiffScope`(all/unstaged/staged), `commit_index`(테스트 37)                                                                                                                                                                                 |
| 2026-10-01 | PR #5 squash merge(`3c20d93`). M2: 충돌 해결(`git/conflict.rs`, `src/conflict.ts` 마커 파서 + vitest 6, `ConflictSheet`, 충돌이 나면 자동으로 열림)(테스트 40)                                                                                                                                                                                         |
| 2026-10-01 | PR #6 squash merge(`6f8978a`, Windows CRLF 테스트 수정 포함). 그래프에 진행 중 병합 표시(`incoming`, MERGE/CHERRY_PICK/REVERT_HEAD), 알림 위치를 아래로(테스트 41)                                                                                                                                                                                     |
| 2026-10-01 | PR #7 squash merge(`fed643f`). M3: 이전 이력 더 불러오기(그래프 꼬리 버튼, `limit` 상태, 레이아웃이 바뀌어도 최신 커밋 기준으로 카메라 고정, 불러온 이력에는 반짝임 효과 없음)                                                                                                                                                                         |
| 2026-10-01 | PR #8 squash merge(`fd705ac`). M3: 파일 감시(`git/watch.rs`, notify-debouncer-mini, `repo-changed` 이벤트), 실제 앱에서 터미널 커밋이 바로 반영되는 것 확인(테스트 43)                                                                                                                                                                                 |
| 2026-10-01 | PR #9 squash merge(`f440e4b`). M3: 라벨 겹침 회피(`graph/labels.ts` `placeBadges`: HEAD 우선, 겹치면 위로 올리고 연결선, 그래도 안 되면 "+N" 칩)(vitest 24)                                                                                                                                                                                            |
| 2026-10-01 | PR #10 squash merge(`3f4e8f7`). M2 마무리: 줄 단위 스테이징(`select_lines`: 고르지 않은 `-`는 문맥으로, `+`는 버림, 내리기는 반대), 충돌 블록 직접 편집(줄바꿈 보존), 알림을 그래프 영역 안으로(테스트 47, vitest 25)                                                                                                                                  |
| 2026-10-01 | PR #11 squash merge(`d3461b1`). M3: 일직선 구간 접기(`graph/runs.ts` `straightRuns`, ref·HEAD·stash·병합 대기 커밋은 접지 않음, 검색 중이거나 선택된 구간은 펼친 채로), 데모 `__otgitDemo.grow(n)`(vitest 28)                                                                                                                                          |
| 2026-10-01 | PR #12 squash merge(`0dea355`). 성능 항목은 측정 후 보류(수치는 M3에 기록). M5: Playwright e2e(`e2e/`, `npm run e2e`, CI 잡 추가, 반복 60회 안정), 데모 `__otgitDemo.snapshot()`                                                                                                                                                                       |
| 2026-10-01 | PR #13 squash merge(`1de7c77`). e2e가 첫 CI에서 실제 버그를 잡았다(최신 Chromium `scrollTo`가 Promise를 돌려줘서 diff 시트가 깨짐, effect 식 본문 → 블록). M5: ESLint 추가, 같은 실수를 막는 규칙                                                                                                                                                      |
| 2026-10-01 | PR #14 squash merge(`4b08f67`). M4: 백포트 트래커(`git/backport.rs`: `--cherry-mark`로 같은 패치, `-x` 트레일러로 고쳐서 옮긴 것까지 인식, 제외는 `otgit.backportIgnored` 로컬 config, 일괄 cherry-pick -x, `format-patch` 내보내기, `BackportSheet`)(테스트 50, e2e 6)                                                                                |
| 2026-10-01 | PR #15 squash merge(`91920f1`). 원격 추가·삭제(`RefOp::AddRemote/RemoveRemote`, 사이드바 ＋, `NameDialog` 두 번째 칸 일반화, 백포트 시트 안내를 버튼으로)(테스트 51, e2e 7)                                                                                                                                                                            |
| 2026-10-01 | PR #16 squash merge(`fac2a73`). M4: interactive rebase(`git/rebase.rs`: 미리 쓴 todo를 `sequence.editor=cp`로 넣음, 빠진 커밋·맨 앞 squash 거부, 충돌은 기존 흐름; `rebasePlan.ts` + vitest 4; `RebaseSheet`)(테스트 54, e2e 8)                                                                                                                        |
| 2026-10-01 | PR #17 squash merge(`5a95888`). 강제 push(`RemoteOp::ForcePush` = `push --force-with-lease`, 거부 화면 세 번째 선택, 그사이 남이 올린 커밋은 lease가 막는 것을 bare 저장소로 테스트)(테스트 55, e2e 9)                                                                                                                                                 |
| 2026-10-01 | PR #18 squash merge(`d6bf590`). M5: react-hooks 권장 규칙 전부 켬. effect 안 setState 9곳 → 렌더 중 조정(경로·초기 파일·부분 스테이지), 데이터를 키와 함께 저장(패널 파일·충돌 파일·줄 선택), diff 다시 불러오기를 fetch만 하도록 분리, 첫 로드에 늦게 온 응답 무시                                                                                    |
| 2026-10-01 | PR #19 squash merge(`74f7924`). 백포트: 제외를 받는 쪽별 config(`otgit.<target>.backportIgnored`, 예전 저장소 전체 키도 읽음), `backport_summary` + "대상별" 탭(테스트 56, e2e 10)                                                                                                                                                                     |
| 2026-10-01 | PR #20 squash merge(`1d0ac4e`). M5: 설정 화면(`settings.ts` 파싱 + vitest 3, `SettingsDialog`, `git::set_program` 전역 git 경로를 검증 후 적용, 예전 `otgit.animate` 키 이어받음)(테스트 57, e2e 11)                                                                                                                                                   |
| 2026-10-01 | PR #21 squash merge(`62759c0`). M5: 키보드로 커밋 이동(`graph/navigate.ts` `stepFrom` + vitest 2, 화면 밖이면 배율 유지하며 따라감, 입력·목록에 포커스가 있을 땐 화살표를 가로채지 않음), 스크린리더 안내(e2e 12)                                                                                                                                      |
| 2026-10-01 | PR #22 squash merge(`2aa0abf`). M4: Shift+끌기로 커밋 순서 옮기기(`planMove` + vitest 3, 드래그 모드 `move`, 확인은 기존 RebaseSheet에서)(e2e 13)                                                                                                                                                                                                      |
| 2026-10-01 | PR #24 squash merge(`d284a40`). 사용자 결정: 밝은 테마 없음, 은하계 스타일, 영어 번역 필요, 서명·자동 업데이트는 나중에, 배포는 dmg/exe. 은하계 스타일(`graph/space.ts`, UI 토큰 `--glass*`/`--ui*`, 조작 요소의 네온·발광 제거, CONVENTIONS에 규칙)                                                                                                   |
| 2026-10-01 | PR #25 squash merge(`d2a5ccf`). 배포: `bundle.targets = [dmg, nsis]`(macOS 11+, universal / Windows 사용자 설치, 한·영 설치 화면), `release.yml`(태그 → 초안 Release, 수동 실행 → artifact), 옷깃 아이콘(은하계 + 네온 브랜치 그래프, `tauri icon`으로 전 크기 생성)                                                                                   |
| 2026-10-01 | PR #26 squash merge(`f7363d7`). i18n 기반: `src/i18n`(`ko.ts` 원본, `en.ts`, `t()`, `<Rich>`), 설정에 언어(시스템/한국어/English, `<html lang>`), 탑바·사이드바·검색·다이얼로그·설정·단축키 표·그래프 글자 번역, Playwright는 `ko-KR` 고정 + 영어 전환 e2e(vitest 42, e2e 14)                                                                          |
| 2026-10-01 | PR #27 squash merge(`c46fd83`). i18n B: App의 알림·메뉴·확인 문구, 진행 중 배너(`stateText`), Inspector·Composer·StashPanel 번역(e2e 14)                                                                                                                                                                                                               |
| 2026-10-01 | i18n C: Backport·Conflict·Diff·Rebase 시트, Auth·Sync 다이얼로그, `rebasePlan` 사유·동작 이름 번역. `<Rich bold>`로 `<b>`에 클래스. 이제 `src/` 화면 문구는 모두 사전에 있다(e2e 14)                                                                                                                                                                   |
| 2026-10-01 | PR #28 squash merge(`78ed8a8`). v0.1.0: 태그 push가 세션 환경에서 막혀서 Release 수동 실행에 `release` 옵션 추가(`v__VERSION__` 초안, 공개 시 태그 생성)                                                                                                                                                                                               |
| 2026-10-01 | PR #29 squash merge(`080b09d`). M6 계획(사용자 요청: 무한맵, 멀티탭, 연결 방법, 고급 작업, 하늘 회전, 브랜드, 게임 같은 연출). 우주 다듬기: `clampView`(+vitest 3), `skyAngle`(+vitest 1), "옷깃" 삭제                                                                                                                                                 |
| 2026-10-01 | PR #30 squash merge(`034e64b`). M6 연결: `git/setup.rs`(clone·init·repo_root + 테스트 4), `recent.ts`(+vitest 3), `Connect.tsx`(저장소 메뉴·첫 화면·clone 창, 인증 실패 시 `AuthDialog`에 `git clone` 안내), 끌어다 놓기(Tauri 드래그 이벤트, 저장소가 아니면 init 제안). 저장소를 바꿀 때 ResizeObserver가 사라진 캔버스를 건드리던 오류 수정(e2e 16) |
| 2026-10-01 | PR #31 squash merge(`b7620a3`). M6 멀티탭: App을 탭 셸(`App`)과 저장소 화면(`RepoView`)으로 나눔, `tabs.ts`(+vitest 4), `TabBar`, 숨은 탭은 그리지 않고(캔버스 0×0) 돌아와도 카메라 유지, 탭 전환 워프(반짝임 효과가 켜졌을 때), 알림은 창 하나에서(e2e 17)                                                                                            |
| 2026-10-01 | PR #32 squash merge(`cfe8e36`). M6 실수 되돌리기: `git/undo.rs`(reset·reflog + 테스트 4), `components/Undo.tsx`(되돌리기 창: 모드별 결과·push·버릴 변경 경고, 되돌리기 기록 시트: 잃어버린 커밋 표시·브랜치로 살리기·여기로 되돌리기), 데모 reflog(명령마다 HEAD 이동 기록), 되감기 연출(그래프 영역 안, `.fx-clip`)(e2e 18)                           |
| 2026-10-01 | PR #33 squash merge(`96a6026`). M6 브랜치 정리: `git/cleanup.rs`(report·delete_branches + 테스트 2: 병합/gone 판정은 로컬 bare 원격에서 다른 클론이 브랜치를 지우는 상황으로), `CleanupSheet`(병합 완료는 기본 선택, gone, 90일 넘은 오래된 브랜치, 병합 안 된 게 섞이면 확인), `GraphHandle.screenOf`로 지운 끝 자리에 별가루(e2e 19)                 |
| 2026-10-01 | PR #34 squash merge(`a874e36`). M6 과거 커밋 손보기: `git/edit.rs`(`CommitEdit` reword/author/split + `restore_file`, 테스트 7: 뿌리 커밋, 따옴표·공백 경로, autostash, 가지 밖 거부, UI JSON 모양), `EditCommitDialog`, Inspector 변경 파일 우클릭(이 커밋 상태로 / 이전 상태로), 노바 연출(e2e 20)                                                   |
| 2026-10-01 | PR #35 squash merge(`59571df`). M6 bisect: `git/bisect.rs`(+테스트 2: 9개 중 범인 찾기, 건너뛰기), 그래프 `NodeBadge`(good/bad 고리, probe 조준선, culprit 맥박), 전용 배너, 후보 밖 흐리게(focus), 데모 bisect(HEAD는 그대로, 상태로만)(e2e 21)                                                                                                       |
| 2026-10-01 | PR #36 squash merge(`d995819`). M6 파일 이력·blame: `git/history.rs`(+테스트 2: 이름 바뀜 따라가기, 줄마다 커밋), 그래프 `trail`(금빛 별자리·혜성), 이력 배너, `BlameSheet`(별 온도 색), CI e2e 단계 timeout(e2e 22)                                                                                                                                   |
| 2026-10-01 | PR #37 squash merge(`aff5c4d`). bisect e2e를 메뉴 제목 확인 후 재시도로 안정화(`commitMenu`). M6 원격 연출: `components/Fx.tsx`(`useFx` 효과 큐 + `FxLayer`, 노바·별가루·되감기도 옮김), push 궤적·혜성(`offset-path`), fetch·pull 유성(작업 전후 스냅샷 비교, `latest` ref)(e2e 23)                                                                   |
| 2026-10-01 | PR #38 squash merge(`aedb7fc`). 연출 2단계 그래프 작업: renderer `drawGravityWell`, `Fx` fusion·comet·constellation, `playAfterDraw`(rAF로 카메라가 멈출 때까지 기다림, `run()`이 끝난 뒤 새 스냅샷 기준), CI Linux deps 단계 timeout(e2e 24)                                                                                                          |
