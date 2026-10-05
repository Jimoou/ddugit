# QA 계획 (v1.0)

> v1.0.0 출시 전에 ddugit 앱(데스크톱·데모)과 ddugit.com 사이트의 모든 사용자 기능을 무엇으로 확인하는지 정리한 문서다.
> 기준: 앱 `93d087d`(버전 0.8.0), 사이트 `ddugit-site` `37e0aa4`. 테스트 이름은 이 시점의 것이다. 2026-10-05에 5장의 앱 쪽 빈칸(e2e·vitest)을 채우고 판정을 고쳤다.
> 테스트 파일은 나뉘거나 옮겨질 수 있으니 **테스트 이름**(e2e·vitest의 문자열, cargo의 함수 이름)으로 찾는다: `npx playwright test -g "<이름>"`, `npx vitest run -t "<이름>"`, `cargo test <함수>`.

## 1. 범위와 테스트 층

### 1.1 범위

- 앱: macOS(universal `.dmg`, 서명·공증)와 Windows(NSIS `.exe`, 서명 없음). Linux는 개발·CI용으로만 빌드한다
- 데모: 브라우저에서 가상 저장소(`src/mock/`)로 도는 같은 화면. e2e의 대상
- 사이트: ddugit.com(Next.js 16, Netlify) + Supabase(Auth, `licenses`·`devices`·`activations`·`reports` 테이블, Edge Functions)
- 배포: `release.yml`(dmg·exe, Supabase Storage `releases/`, `downloads.json`, `latest.json`)

### 1.2 실행하는 법

| 층              | 명령                                                                                                                            | 무엇을 도는가                                                                                                                                                                   | CI                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 웹 검사         | `npm run check`                                                                                                                 | `tsc`(앱 + `e2e/`), ESLint, Prettier `--check`, vitest(`src/**/*.test.ts` 42개 파일 + `scripts/downloads.test.mjs`)                                                             | `ci-web.yml` Web 잡(PR에서 `src/`·`e2e/`·설정이 바뀔 때) + `npm run build`    |
| e2e             | `npm run e2e`                                                                                                                   | Playwright(Chromium)가 `npm run dev`(localhost:1420) 데모를 띄워 `e2e/*.e2e.ts`를 돈다. 페이지 오류·콘솔 오류가 하나라도 나면 실패(`fixtures.ts`)                               | `ci-web.yml` E2E 잡                                                           |
| e2e(샌드박스)   | `PW_CHROMIUM=/opt/pw-browsers/chromium npm run e2e`                                                                             | 브라우저를 내려받을 수 없는 환경에서 미리 깔린 Chromium을 쓴다                                                                                                                  | —                                                                             |
| Rust            | `cd src-tauri && mkdir -p ../dist && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`              | 모듈마다 `#[cfg(test)]`: 임시 저장소(`testutil`)에서 실제 git CLI·libgit2, 로컬 bare 원격, 가짜 HTTP 서버(forge, clone 인증 실패), 가짜 키체인(device)                          | `ci-rust.yml`(ubuntu, PR에서 `src-tauri/`가 바뀔 때). 릴리스 전 `all_os` 수동 |
| Rust(벤치)      | `DDUGIT_BENCH_REPO=<경로> cargo test --release -- --ignored snapshot_bench` 등                                                  | `read.rs` `snapshot_bench`, `diff.rs` `diff_bench`(`#[ignore]`). 합성 저장소는 `scripts/perf/gen.py`, 화면 쪽은 `scripts/perf/bench.mjs`. 절차와 기준 수치는 [PERF.md](PERF.md) | —                                                                             |
| Rust(상호 확인) | `DDUGIT_LICENSE_PUBKEY=<공개키> DDUGIT_TEST_LICENSE=<license.mjs sign 결과> cargo test installs_a_license_issued_by_the_script` | 발급 스크립트와 앱 검증이 같은 형식인지. 변수가 없으면 아무것도 안 하고 통과한다                                                                                                | —                                                                             |
| 사이트 검사     | `cd ../ddugit-site && npm run check`                                                                                            | `tsc`, ESLint, Prettier, `node --test`(`src/lib/*.test.ts` 4개, `supabase/functions/_shared/*.test.ts` 4개)                                                                     | 사이트 저장소 CI                                                              |
| 사이트 빌드     | `npm run build`                                                                                                                 | Next 빌드(라우트·서버 액션 타입, 정적 페이지 생성)                                                                                                                              | Netlify 배포                                                                  |

알아둘 것:

- e2e는 `reuseExistingServer`라서 이미 떠 있는 vite를 쓴다. `src/mock/`을 고쳤으면 `pkill -f "[v]ite --port 1420"` 후 다시 돈다.
- e2e가 기다리는 것은 데모가 흉내 내는 작업 시간(진행 카드의 타이머)도 포함한다. 부하가 크면 이 시간이 늘어나니, 오래 걸리는 작업은 결과(상태)를 넉넉한 시간 제한으로 기다린 뒤 토스트를 본다("adds a remote from the GitHub tab, named after the owner"가 그렇게 고쳐졌다). 다른 테스트가 부하로 시간 초과가 나면 단독으로 다시 돌려 본다.
- 데모 제어값(`window.__ddugitDemo`, `src/mock/controls.ts`)과 시작 전 플래그(`demoFlags`: `Pro`·`Update`·`GitMissing`·`License`·`Tabs`)로 실패·충돌 상황을 만든다: `failNextRemote`(fetch·pull·push·clone·서브모듈 업데이트·LFS 받기), `conflictNext`(병합·cherry-pick·revert·정리·stash pop)와 `binaryConflict`, `signFail`, `lfs`, `nextBundle`, `diffs`
- 일부 cargo 테스트는 도구가 없으면 **조용히 건너뛴다**: `ssh-keygen`(`ssh.rs` `makes_a_key_and_lists_it_with_its_public_half`), `git-lfs`(`lfs.rs` `tracks_patterns_and_finds_files_left_as_pointers`). 새 기계에서는 `which ssh-keygen git-lfs`를 먼저 본다.
- Linux에서 Rust를 빌드하려면 `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`가 필요하다.

### 1.3 각 층이 증명하는 것과 못 하는 것

| 층               | 증명하는 것                                                                                                                                          | 증명 못 하는 것                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vitest           | 순수 로직(레이아웃, 장면 색인, 검색, rebase 계획, 충돌 파싱, 설정·저장값 파싱, i18n 사전 일치, 가리기, 그룹, 스택, 노트 묶기 등)                     | 화면, Tauri 호출, 실제 git                                                                                                                                                                                  |
| e2e(데모)        | 화면 흐름 전체: 클릭·끌기·키보드·대화상자·토스트, `api.ts` `Commands` 계약을 따르는 **가짜 백엔드**(`src/mock/`) 위의 상태 변화, 한국어·영어 문구    | 실제 git 동작(mock은 git을 흉내만 낸다), Rust 명령과 mock의 불일치, OS 창·파일 대화상자·키체인·클립보드 권한, 네트워크, 업데이터, 실제 성능                                                                 |
| cargo            | 실제 git CLI/libgit2로 임시 저장소에서의 쓰기·읽기, 로컬 bare 원격의 fetch/pull/push, 인증 실패 분류, 라이선스 서명 확인, forge 응답 파싱(가짜 서버) | Tauri 명령 등록(`lib.rs`, Pro 잠금은 명령 본문을 직접 부른다)과 화면 연결, 실제 GitHub/GitLab API, 실제 SSH 서버·에이전트, GPG 에이전트, OS 키체인, macOS·Windows 경로 차이(CI는 ubuntu만, `all_os`는 수동) |
| 사이트 node:test | 라이선스 형식·사용 가능 규칙, 활성화 대상 고르기, 웹훅 서명·주문 해석, 신고 검사·속도 제한, 관리자 필터, 전달 비밀·IP 규칙                           | 실제 Supabase(RLS·트리거·마이그레이션), OAuth 로그인, Lemon Squeezy, Netlify 헤더, 페이지 렌더링                                                                                                            |
| 실기(사람)       | 설치·서명·SmartScreen·자동 업데이트, 실제 계정(GitHub·GitLab·Supabase·Lemon Squeezy), SSH·GPG, 키체인, 창 테두리, 큰 실제 저장소                     | —                                                                                                                                                                                                           |

## 2. 기능별 점검표

판정:

- `자동`: 기대 동작의 핵심 경로를 자동 테스트가 확인한다
- `부분`: 일부만 확인한다(백엔드만, 로직만, 화면 일부만). 빠진 곳은 "빈칸"에 적는다
- `없음`: 자동 테스트 없음
- `+실기`: 위와 별도로 실기 확인 필요(실제 OS·네트워크·계정). 4장 스크립트에서 다룬다

표기: e2e는 `파일` › "테스트 이름", vitest는 `src/…test.ts` › "이름"(describe 안의 it), cargo는 `src-tauri/src/` 아래 `파일` › `함수`.

### 2.0 요약

| 묶음                        | 항목    | 자동    | 부분   | 없음  | +실기  |
| --------------------------- | ------- | ------- | ------ | ----- | ------ |
| A. 그래프와 탐색            | 16      | 13      | 3      | 0     | 1      |
| B. 커밋과 스테이징          | 7       | 7       | 0      | 0     | 0      |
| C. diff                     | 4       | 4       | 0      | 0     | 0      |
| D. 브랜치·태그·원격 관리    | 8       | 8       | 0      | 0     | 0      |
| E. Fetch · Pull · Push      | 7       | 7       | 0      | 0     | 1      |
| F. stash                    | 3       | 3       | 0      | 0     | 0      |
| G. 병합과 충돌              | 7       | 7       | 0      | 0     | 0      |
| H. cherry-pick · revert     | 5       | 5       | 0      | 0     | 0      |
| I. interactive rebase       | 4       | 4       | 0      | 0     | 0      |
| J. 지난 커밋 손보기         | 5       | 5       | 0      | 0     | 0      |
| K. reset · reflog           | 4       | 4       | 0      | 0     | 0      |
| L. bisect                   | 2       | 2       | 0      | 0     | 0      |
| M. 파일 이력 · blame        | 2       | 2       | 0      | 0     | 0      |
| N. 브랜치 정리              | 1       | 1       | 0      | 0     | 0      |
| O. worktree                 | 3       | 3       | 0      | 0     | 0      |
| P. 서브모듈                 | 2       | 2       | 0      | 0     | 0      |
| Q. LFS                      | 3       | 3       | 0      | 0     | 0      |
| R. 저장소 들어오기와 탭     | 7       | 5       | 2      | 0     | 4      |
| S. 내 저장소(은하 대시보드) | 4       | 4       | 0      | 0     | 0      |
| T. 백포트                   | 6       | 6       | 0      | 0     | 0      |
| U. 폐쇄망 반출입(Pro)       | 3       | 3       | 0      | 0     | 0      |
| V. 스택 브랜치(Pro)         | 3       | 3       | 0      | 0     | 0      |
| W. 릴리스 노트(Pro)         | 2       | 2       | 0      | 0     | 0      |
| X. GitHub · GitLab          | 6       | 5       | 1      | 0     | 4      |
| Y. SSH                      | 2       | 2       | 0      | 0     | 1      |
| Z. 커밋할 사람과 서명       | 4       | 4       | 0      | 0     | 3      |
| AA. 설정 · 단축키 · 언어    | 4       | 4       | 0      | 0     | 1      |
| AB. 앱 업데이트             | 1       | 0       | 1      | 0     | 1      |
| AC. Free / Pro              | 3       | 3       | 0      | 0     | 0      |
| AD. 라이선스                | 5       | 4       | 1      | 0     | 4      |
| AE. 문제 신고               | 5       | 5       | 0      | 0     | 1      |
| AF. 첫 실행과 Git 없음      | 2       | 2       | 0      | 0     | 1      |
| AG. 오류 경계와 안전        | 3       | 2       | 1      | 0     | 1      |
| AH. 키보드와 대화상자       | 4       | 3       | 0      | 1     | 0      |
| AI. 창과 레이아웃           | 2       | 1       | 1      | 0     | 1      |
| AJ. 큰 저장소 성능          | 1       | 0       | 1      | 0     | 1      |
| AK. 설치와 배포             | 3       | 1       | 0      | 2     | 3      |
| **합계**                    | **153** | **139** | **11** | **3** | **28** |

`+실기`는 다른 판정과 겹쳐 센다(자동 테스트가 있어도 실기 확인이 필요한 항목). 사이트는 3장에 따로 센다.

### A. 그래프와 탐색

- **A1 레인 레이아웃** `자동` — trunk(main/master)는 0번 레인, 브랜치 색 고정, 관계없는 브랜치는 레인을 다시 쓴다, 불러온 범위 밖 부모로 가는 간선은 생략, 빈 저장소.
  - vitest: `src/graph/layout.test.ts` › "keeps a linear history in one lane", "pins trunk to lane 0 and puts the feature branch beside it", "trunk stays in lane 0 even when a newer side branch comes first", "skips edges to parents outside the loaded window", "handles an empty repository", "frees lanes so unrelated branches reuse them", "gives main/master the trunk colour and other branches a stable one"
- **A2 장면·그리기 범위** `부분` — 간선 경계 상자와 행 색인으로 화면에 걸친 것만 그린다. 반짝임 흐름.
  - vitest: `src/graph/scene.test.ts` › "bounds each edge by its rows and the lanes it runs through", "finds the edges crossing a span of rows, long ones included, in layout order", "reads the commit at a row and lane", "maps world x to a fraction of the edge", "keeps the evenly spaced sparkles that fall in the window"
  - 빈칸: `renderer.ts`(실제 그리기)는 자동 테스트 없음. 눈으로 확인
- **A3 줌·팬·카메라** `자동` — 휠·⌘휠·Shift휠, `+`/`-`, `0` 맞추기, `H` HEAD로, 그래프가 화면 밖으로 사라지지 않음(KEEP px).
  - vitest: `src/graph/camera.test.ts` › "leaves a view showing the graph alone", "stops panning once only KEEP px of the graph would remain", "keeps less than KEEP on a small viewport"
  - e2e: `graph.e2e.ts` › "folds a straight run when zoomed out and unfolds it on click"(HUD 축소 버튼); `history.e2e.ts` › "hunts down the commit that broke something with bisect"(`h`)
  - e2e: `graph.e2e.ts` › "zooms with the keys and Ctrl+wheel, pans with the wheel, and the minimap jumps there"(`+`/`-`/`0`, ⌘휠·휠·Shift휠)
- **A4 직선 구간 접기** `자동` — 50% 미만에서 4개 이상 직선 구간이 개수 막대가 되고 누르면 펼쳐 확대한다.
  - e2e: `graph.e2e.ts` › "folds a straight run when zoomed out and unfolds it on click"
  - vitest: `src/graph/runs.test.ts` › "folds the inside of a linear history, not its tip or root", "splits at kept commits and drops runs shorter than min", "stops at merges and fork points", "returns the runs reaching into a span of rows"
- **A5 커밋 라벨·브랜치 배지 배치** `자동` — 지도식 가로 라벨(겹치면 우선순위로 숨김, 지시선), 배지 겹침 회피, 세로 회전에서 줄 안 배지.
  - vitest: `src/graph/captions.test.ts`(6개, "hang right under their star, …" 외), `src/graph/labels.test.ts` › "leaves far-apart groups at their natural height", "lifts a neighbour whose badges would overlap", "places priority groups first so they never move", "folds a crowded stack into first badge + overflow chip", "skips empty groups", "lines badges up away from the graph, leaving the rest of the row to the summary"
- **A6 커밋 미리보기 카드** `자동` — 별에 0.35초 머물면 요약·ID·파일·PR, 떠나면 닫힘.
  - e2e: `graph.e2e.ts` › "resting the pointer on a star shows a preview card of the commit"
  - vitest: `src/components/Peek.test.ts` › "skips the summary and blank lines and keeps the first few"
- **A7 90° 회전** `자동` — HUD·`R`로 0/90/180/270°, 클릭·화살표가 회전을 따름, 설정에 저장.
  - e2e: `graph.e2e.ts` › "turns the graph a quarter at a time and keeps commits, arrows and the setting with it"
  - vitest: `src/graph/camera.test.ts` › "keeps a turned graph on screen along its turned axes"
- **A8 키보드 탐색·스크린리더** `자동` — ←→ 부모/자식, ↑↓ 옆 레인, Enter 메뉴, aria-live로 읽기.
  - e2e: `graph.e2e.ts` › "moves through commits with the keyboard and announces them"
  - vitest: `src/graph/navigate.test.ts` › "walks first parents and children along the same line", "jumps to the nearest commit in the next lane"
- **A9 커밋 검색** `자동` — ⌘/Ctrl+F, 메시지·본문·작성자·SHA(4자 이상)·브랜치 이름, 그래프 하이라이트, Enter/Shift+Enter로 결과 이동.
  - vitest: `src/graph/search.test.ts` › "matches message text case-insensitively, including the body", "matches author and email", "matches SHA prefixes of 4+ hex chars only", "matches ref names and keeps newest-first order", "returns nothing for a blank query"
  - e2e: `graph.e2e.ts` › "finds commits with Ctrl+F, walks the matches with Enter and Shift+Enter, and flies to each"(대소문자 무시, SHA 앞부분, 없음, 끝에서 돌아감, 카메라 이동, Esc 후 선택 유지)
- **A10 미니맵** `자동` — 전체 개요, 클릭으로 이동, 그래프가 낮으면 숨김.
  - e2e: `history.e2e.ts` › "keeps the diff and the conflict sheet usable in a small window"(숨김만)
  - e2e: `graph.e2e.ts` › "zooms with the keys and Ctrl+wheel, pans with the wheel, and the minimap jumps there"(클릭 이동)
- **A11 이전 이력 더 불러오기** `자동` — 왼쪽 끝 "⋯ 이전 이력 더 불러오기", 설정한 개수(1000/3000/10000)씩, 카메라 위치 유지.
  - cargo: `git/read.rs` › `history_limit_sets_truncated`, `children_first_moves_a_parent_after_its_skewed_child`
  - e2e: `graph.e2e.ts` › "loads older history from the end of the graph and keeps the camera where it was"(`?page=10`), `settings.e2e.ts` › "settings: a smaller history size reads the repository again with fewer commits"
- **A12 자동 새로고침·⌘R** `부분` `+실기` — 파일이 바뀌면 300ms 뒤 다시 읽는다(무시 경로 제외), 보이는 탭만 감시, ⌘/Ctrl+R.
  - cargo: `git/watch.rs` › `relevance_rules`, `editing_a_file_triggers_the_callback`
  - e2e: `branches.e2e.ts` › "switches branch from the top bar and re-reads the repository with Cmd/Ctrl+R"
  - 실기: 외부 편집기·터미널에서 커밋하면 macOS(FSEvents)·Windows(ReadDirectoryChangesW)에서 그래프가 따라오는지
- **A13 사이드바** `자동` — 섹션 접기(저장), 레일로 접기(⌘/Ctrl+B, 아이콘으로 그 섹션 열며 펼침), 브랜치 여러 개 고르기(클릭 토글, 선택 해제).
  - e2e: `branches.e2e.ts` › "folds sidebar sections and the whole sidebar, and keeps the layout"; `graph.e2e.ts` › "several branches can be picked in the sidebar, lighting their histories together"
- **A14 커밋 인스펙터** `자동` — 본문 전체, 한 줄 메타, sha 복사, 부모로 이동, 포함한 브랜치·PR·CI, 폴더로 묶은 파일과 +/− 막대.
  - e2e: `commit.e2e.ts` › "inspector: shows whether a commit is signed"(부모로 이동); `repos.e2e.ts` › "opens repositories in tabs and keeps each tab's state"(선택 유지)
  - vitest: `src/components/ChangedFiles.test.ts` › "groups files by folder, root files first, folders in path order"
  - e2e: `commit.e2e.ts` › "inspector: copies the commit id, lists the branches holding it, and says when copying fails", "inspector: a changed file opens the commit's diff sheet, read-only"
- **A15 우주 연출** `자동` — push 혜성, fetch 유성, 병합 섬광, cherry-pick 혜성, 충돌 성운, rebase 별자리. 반짝임을 끄면 아무것도 안 나옴. 하늘 회전.
  - e2e: `remote.e2e.ts` › "a push rides a comet into orbit and fetched commits arrive as meteors, unless sparkles are off"; `history.e2e.ts` › "merges by dragging a branch tip onto HEAD", "cherry-picks a commit from its menu and a comet carries the copy over", "resolves a conflict block by editing it by hand"(성운), "reorders and folds commits with the interactive rebase sheet"
  - vitest: `src/graph/space.test.ts` › "turns slowly while animating, holds still otherwise, and ignores long gaps"
- **A16 진행 중 작업 표시** `부분` — 멈춘 병합·cherry-pick·revert의 들어오는 커밋 → ＋ 빨간 점선, 진행 중 띠.
  - cargo: `git/read.rs` › `stopped_merge_reports_incoming_commit`
  - e2e: `pro.e2e.ts` › "a backported commit that is already there stops as empty and is skipped, not sent to the conflict sheet"(띠)
  - e2e: `history.e2e.ts` › "a cherry-pick stopped on conflicts goes on from its banner"(띠, 스냅샷의 `incoming`)
  - 빈칸: 점선 그리기(캔버스, 눈으로 확인)

### B. 커밋과 스테이징

- **B1 커밋 작성** `자동` — 탑바 Commit·HEAD 다음 ＋, ⌘/Ctrl+Enter, 고른 파일만, 경로를 문자 그대로.
  - e2e: `commit.e2e.ts` › "adds a checkpoint from the + composer"
  - cargo: `git/write.rs` › `commit_only_selected_paths`, `commit_takes_paths_literally`
- **B2 hunk 스테이지·내리기** `자동` — diff 시트 "변경 / 스테이지됨" 탭, hunk마다 스테이지·내리기, 보여 준 뒤 바뀐 hunk는 거부, 스테이지된 것만 커밋.
  - cargo: `git/stage.rs` › `stage_one_hunk_and_commit_only_that`, `unstage_a_hunk`, `select_hunks_keeps_header_and_chosen_blocks`, `a_hunk_that_changed_since_it_was_shown_is_refused`
  - e2e: `commit.e2e.ts` › "stages a whole hunk from the diff sheet and takes it back from the staged tab"; 줄 단위는 "stages single lines picked in the diff"
- **B3 줄 단위 스테이지** `자동` — 줄 번호 클릭, Shift로 범위, 내리기도 같은 방식, 비 UTF-8 파일도 바이트 그대로.
  - e2e: `commit.e2e.ts` › "stages single lines picked in the diff"
  - cargo: `git/stage.rs` › `stage_and_unstage_single_lines`, `stage_lines_of_additions_deletions_and_new_files`, `line_selection_errors`, `select_lines_follows_no_newline_marker`, `stages_hunks_and_lines_of_non_utf8_files_byte_for_byte`
- **B4 새 파일 스테이지** `자동` — untracked 파일 스테이지, 깨진 index 거부.
  - cargo: `git/stage.rs` › `stage_untracked_file_and_reject_bad_index`
  - e2e: `commit.e2e.ts` › "stages a new, untracked file from the diff sheet as an added file"
- **B5 amend(마지막 커밋 수정)** `자동` — 메시지만 또는 파일 추가.
  - e2e: `remote.e2e.ts` › "overwrites the upstream after rewriting a pushed commit"
  - cargo: `git/write.rs` › `amend_rewords_or_adds_files`
- **B6 변경 버리기(discard)** `자동` — 수정·untracked·스테이지된 새 파일, 경로 문자 그대로, 첫 커밋 전에도.
  - cargo: `git/stash.rs` › `discard_handles_modified_untracked_and_staged_new`, `discard_and_stash_take_paths_literally`, `discard_on_unborn_branch`
  - e2e: `commit.e2e.ts` › "discarding picked files asks first, and only those files are restored"
- **B7 커밋 창 단축키** `자동` — `[`/`]` 파일 이동, 줄 고르기 키(단축키 표의 "커밋" 묶음).
  - e2e: `commit.e2e.ts` › "the diff sheet steps through files with [ and ], and draws only the rows near view in a long file"; ⌘/Ctrl+Enter는 "adds a checkpoint from the + composer", 줄 고르기는 "stages single lines picked in the diff"

### C. diff

- **C1 커밋 diff** `자동` — 첫 부모 기준, 루트 커밋은 전체 추가.
  - cargo: `git/diff.rs` › `commit_diff_against_parent_and_root`
  - e2e: `commit.e2e.ts` › "inspector: a changed file opens the commit's diff sheet, read-only"
- **C2 작업 트리 diff** `자동` — untracked 포함, 경로 필터, 첫 커밋 전, all/unstaged/staged.
  - cargo: `git/diff.rs` › `worktree_diff_includes_untracked_and_filters_by_path`, `worktree_diff_on_unborn_branch`
  - e2e: `commit.e2e.ts` › "stages single lines picked in the diff"
- **C3 바이너리·큰 파일** `자동` — 바이너리는 hunk 없음, 파일당 50,000줄·전체 100,000줄에서 자름.
  - cargo: `git/diff.rs` › `binary_files_have_no_hunks`, `large_files_are_truncated`
- **C4 가상 스크롤** `자동` — 400줄이 넘으면 화면 근처 줄만 그림(diff·시트·인스펙터 파일 목록).
  - vitest: `src/components/virtual.test.ts` › "adds up row tops", "draws every row of a short list", "draws the rows meeting the viewport and the overscan around it"
  - e2e: `commit.e2e.ts` › "the diff sheet steps through files with [ and ], and draws only the rows near view in a long file"(3,000줄, `diffs` 제어값). 실제 속도는 PERF.md 수동 측정(AJ1)

### D. 브랜치·태그·원격 관리

- **D1 브랜치 만들기** `자동` — 사이드바 ＋·전환 메뉴 '새 브랜치…'·커밋 메뉴 '여기서 새 브랜치', 빈 저장소의 첫 브랜치(원격 main/master에서 시작).
  - e2e: `branches.e2e.ts` › "makes local branches: from a remote-only branch, a new one at HEAD, and under another name"
  - cargo: `git/write.rs` › `a_new_branch_in_an_empty_repository_becomes_its_first_branch`, `a_new_branch_in_an_empty_repository_can_start_from_a_fetched_remote`
- **D2 체크아웃·전환** `자동` — 탑바 전환기, 더블클릭, 파일과 같은 이름의 브랜치도 편집을 지킴.
  - e2e: `branches.e2e.ts` › "switches branch from the top bar and re-reads the repository with Cmd/Ctrl+R"
  - cargo: `git/write.rs` › `checkout_of_a_name_that_is_only_a_file_keeps_its_edits`, `switch_or_create_takes_local_then_remote_then_makes_one`
- **D3 원격 브랜치 체크아웃** `자동` — 추적 브랜치를 만들고, 같은 이름 로컬이 다른 커밋이면 새 이름(`origin-main`)을 묻는다.
  - e2e: `branches.e2e.ts` › "makes local branches: from a remote-only branch, a new one at HEAD, and under another name"
  - cargo: `git/refs.rs` › `checkout_remote_creates_tracking_branch_then_reuses_it`; `git/write.rs` › `checkout_of_a_remote_only_branch_tracks_it`
- **D4 브랜치 이름 변경·삭제** `자동` — 병합 안 된 브랜치는 한 번 더 확인.
  - cargo: `git/refs.rs` › `rename_and_delete_branch_with_unmerged_guard`, `ref_op_json_shape`
  - e2e: `branches.e2e.ts` › "renames a branch, and deleting an unmerged one asks a second time"
- **D5 태그 만들기·삭제** `자동` — 가벼운 태그·주석 태그.
  - cargo: `git/refs.rs` › `lightweight_and_annotated_tags`
  - e2e: `branches.e2e.ts` › "tags a commit and deletes the tag from the sidebar"(mock은 주석 태그 설명을 저장하지 않는다)
- **D6 원격 추가** `자동` — 사이드바 ＋, 추가한 원격만 받아오기, 진행 카드, 받아온 브랜치 수 알림, origin이 아니면 가져오기 전용.
  - e2e: `pro.e2e.ts` › "adds the original project as a remote and lists its fixes to backport"; `remote.e2e.ts` › "the original project added as a remote is fetch-only: a push offers origin instead"
  - cargo: `git/refs.rs` › `add_fetch_and_remove_a_remote`; `git/remote.rs` › `fetches_one_remote_only`, `a_fetch_only_remote_is_never_pushed_to_and_push_to_moves_the_upstream`
- **D7 원격 메뉴** `자동` — 원격별 접기, ⋯ 메뉴(이 원격만 받기, URL 복사, 보내기 허용/막기, 연결 끊기), 원격이 하나뿐이어도.
  - e2e: `remote.e2e.ts` › "a remote can be disconnected from its menu, even the only one"
  - e2e: `remote.e2e.ts` › "a remote's menu copies its URL, fetches it alone, and blocks or allows pushing to it"
- **D8 git에 넘기는 이름 검사** `자동` — `-`로 시작하는 ref·리비전·이름 거부.
  - cargo: `git/mod.rs` › `operands_that_look_like_options_are_refused`

### E. Fetch · Pull · Push

- **E1 Fetch** `자동` — 기본으로 묻지 않음, 새 커밋 알림.
  - e2e: `remote.e2e.ts` › "asks before pull and push, lists what moves, and can stop asking"
  - cargo: `git/remote.rs` › `fetch_then_fast_forward_pull`
- **E2 Pull** `자동` — 확인 창(들어올 커밋, 변경이 있으면 경고), ff-only, 갈라지면 병합/리베이스 선택, 리베이스 충돌, upstream 없음.
  - e2e: `remote.e2e.ts` › "asks before pull and push, lists what moves, and can stop asking"
  - cargo: `git/remote.rs` › `diverged_pull_and_rejected_push`, `rebase_pull_keeps_history_linear`, `conflicting_rebase_pull_reports_conflict`, `pull_without_upstream_is_an_error`
  - vitest: `src/sync.test.ts` › "lists what a push sends and a pull brings"
  - e2e: `remote.e2e.ts` › "a pull that can't fast-forward offers to merge", "a pull that can't fast-forward offers to rebase"
- **E3 Push** `자동` — 확인 창(보낼 곳·커밋 목록, '다시 묻지 않기'), 첫 push는 `-u`, 원격에 없는 커밋 목록.
  - e2e: `remote.e2e.ts` › "asks before pull and push, lists what moves, and can stop asking"; `createPr.e2e.ts` › "creates a pull request from a branch menu, pushing the branch first"
  - cargo: `git/remote.rs` › `first_push_sets_upstream`
  - vitest: `src/sync.test.ts` › "before the first push, lists the commits no remote branch has"
- **E4 Push 거부** `자동` — fetch 후 병합/리베이스하고 다시 push, 또는 덮어쓰기(`--force-with-lease`, 못 본 원격 작업은 지킴).
  - e2e: `remote.e2e.ts` › "overwrites the upstream after rewriting a pushed commit"
  - cargo: `git/remote.rs` › `diverged_pull_and_rejected_push`, `force_push_replaces_rewritten_history_but_not_unseen_work`
  - e2e: `remote.e2e.ts` › "a rejected push merges the upstream in, then pushes"('리베이스하고 push'는 같은 `resolveSync` 경로)
- **E5 진행률** `자동` — `--progress` 파싱, 0.6초 뒤 진행 카드.
  - cargo: `git/remote.rs` › `parses_progress_lines`, `push_reports_progress_and_keeps_it_out_of_output`
  - e2e: `pro.e2e.ts` › "adds the original project as a remote and lists its fixes to backport"
- **E6 인증 실패 안내** `자동` `+실기` — HTTPS(credential helper)·SSH(agent) 안내 창, 출력 보기, 다시 시도. 프롬프트로 멈추지 않음.
  - cargo: `git/remote.rs` › `missing_credentials_are_classified_as_auth`; `git/mod.rs` › `remote_work_gets_no_hidden_prompts_unless_the_user_chose_ssh`, `a_fetch_over_ssh_that_would_prompt_fails_as_auth`
  - e2e: `remote.e2e.ts` › "a fetch or push refused for credentials explains the HTTPS setup and tries again"; SSH는 Y2
  - 실기: macOS osxkeychain·Windows Git Credential Manager, 틀린 비밀번호, 잠긴 ssh-agent
- **E7 동시 작업 거부** `자동` — 원격 작업 중 다른 git 작업은 거부, 진행 카드 유지.
  - e2e: `safety.e2e.ts` › "a second git operation is refused while one is still running"

### F. stash

- **F1 저장·적용·꺼내기·삭제** `자동` — 일부 파일/전체(untracked 포함), id로 지정(다른 stash가 쌓인 뒤에도).
  - cargo: `git/stash.rs` › `partial_stash_then_pop`, `stash_everything_including_untracked_then_apply_and_drop`, `acts_on_the_stash_by_id_after_another_was_pushed`
  - e2e: `commit.e2e.ts` › "stashes picked files, finds the stash on the graph, and applies, pops and drops stashes"
- **F2 충돌 나는 pop** `자동` — 충돌을 알리고 stash는 남긴다.
  - cargo: `git/stash.rs` › `conflicting_pop_reports_conflict_and_keeps_stash`
  - e2e: `commit.e2e.ts` › "a stash that conflicts when popped stops on the conflicts and is kept"(`conflictNext`)
- **F3 그래프 마름모·stash 패널** `자동` — 기준 커밋 옆 마름모, 패널의 시각·기준·꺼내기/적용/삭제.
  - e2e: `commit.e2e.ts` › "stashes picked files, finds the stash on the graph, and applies, pops and drops stashes"(마름모 위치는 개발용 `__ddugit.stashScreenOf`)

### G. 병합과 충돌

- **G1 끌어서 병합** `자동` — 브랜치 끝을 HEAD에 끌어 놓기 → 확인 → 병합 커밋(부모 순서), 섬광.
  - e2e: `history.e2e.ts` › "merges by dragging a branch tip onto HEAD"
  - cargo: `git/write.rs` › `branch_and_merge_creates_merge_commit`, `merge_into_other_branch_checks_it_out`
- **G2 메뉴로 병합** `자동` — 브랜치 메뉴 '…에 병합', 다른 브랜치로 병합하면 먼저 체크아웃, 변경이 있으면 경고.
  - e2e: `history.e2e.ts` › "resolves a conflict block by editing it by hand"
- **G3 충돌 해결 시트** `자동` — 블록마다 현재/들어오는/둘 다, 직접 편집, 파일 전체, 남은 파일 수, CRLF 유지.
  - e2e: `history.e2e.ts` › "resolves a conflict block by editing it by hand"
  - vitest: `src/conflict.test.ts` › "splits text and conflict blocks with labels and diff3 base", "returns a single text segment when there are no markers", "leaves an unterminated block as plain text", "applies one pick per block and keeps surrounding text byte for byte", "keeps markers for blocks without a pick", "uses hand-edited text with the file's line ending and a trailing newline", "handles CRLF files"
  - cargo: `git/conflict.rs` › `reads_all_three_sides_and_markers`, `resolve_with_each_choice_clears_the_conflict`, `resolution_json_shape`
- **G4 바이너리 충돌·리베이스 라벨 반전** `자동` — 바이너리는 파일 전체 선택만, 리베이스 중에는 현재/들어오는 쪽 라벨이 바뀐다.
  - e2e: `history.e2e.ts` › "a binary file in conflict is resolved by picking a whole side", "a tidy-up stopped on conflicts names the sides for a rebase, and goes on or is cancelled"(`binaryConflict`)
- **G5 충돌 해결 안전** `자동` — 충돌 중인 파일만, 작업 트리 안만, 심볼릭 링크는 따라가지 않음.
  - cargo: `git/conflict.rs` › `writes_only_conflicted_files_inside_the_work_tree`, `never_follows_a_conflicted_symlink`
- **G6 병합 취소·계속** `자동` — 진행 중 띠의 취소(abort)·계속(continue), 계속할 때 untracked 파일을 넣지 않음.
  - cargo: `git/write.rs` › `conflicting_merge_reports_conflict_and_can_abort`, `continue_leaves_untracked_files_out`
  - e2e: `history.e2e.ts` › "a merge stopped on conflicts is cancelled from its banner, and a resolved one ends with a commit", "a cherry-pick stopped on conflicts goes on from its banner"(병합은 계속 대신 커밋으로 끝난다)
- **G7 작은 창의 충돌 시트** `자동` — 블록이 접히지 않고, 토스트가 블록을 가리지 않음.
  - e2e: `history.e2e.ts` › "keeps the diff and the conflict sheet usable in a small window"

### H. cherry-pick · revert

- **H1 메뉴로 cherry-pick** `자동` — '…에 cherry-pick', `-x`로 원본 기록, 혜성.
  - e2e: `history.e2e.ts` › "cherry-picks a commit from its menu and a comet carries the copy over"
  - cargo: `git/pick.rs` › `cherry_pick_onto_another_branch_records_origin`
- **H2 Alt+끌기 cherry-pick** `자동` — ⌥/Alt를 누른 채 커밋을 브랜치에 끌어 놓기.
  - e2e: `history.e2e.ts` › "Alt-dragging a commit onto a branch tip cherry-picks it there"
- **H3 revert** `자동` — 일반 커밋과 병합 커밋.
  - cargo: `git/pick.rs` › `revert_undoes_a_commit_and_a_merge`
  - e2e: `history.e2e.ts` › "reverts a commit from its menu"
- **H4 충돌한 cherry-pick 계속·취소** `자동`
  - cargo: `git/pick.rs` › `conflicting_cherry_pick_can_continue_or_abort`
  - e2e: `history.e2e.ts` › "a cherry-pick stopped on conflicts goes on from its banner"; 취소는 G6의 병합과 같은 띠 버튼
- **H5 이미 들어 있는 변경(empty) 건너뛰기** `자동` — 충돌 창 대신 '이미 들어 있는 변경' 창, 띠의 건너뛰기.
  - e2e: `pro.e2e.ts` › "a backported commit that is already there stops as empty and is skipped, not sent to the conflict sheet"
  - cargo: `git/backport.rs` › `a_pick_that_is_already_there_stops_as_empty_and_can_be_skipped`

### I. interactive rebase

- **I1 정리 시트** `자동` — 커밋 메뉴 '이후 커밋 정리', 끌어서 순서, 유지/합치기/버리기, 전부 버리기·합칠 곳 없음은 거부.
  - e2e: `history.e2e.ts` › "reorders and folds commits with the interactive rebase sheet"
  - vitest: `src/rebasePlan.test.ts` › "lists the commits after base, oldest first", "explains when base is not an ancestor or a merge is in the way", "rejects squashing into nothing and dropping everything", "counts what is left and moves steps"
  - cargo: `git/rebase.rs` › `reorder_squash_and_drop`, `refuses_incomplete_or_headless_plans`
- **I2 그래프에서 Shift+끌기** `자동` — 옮긴 계획으로 정리 시트가 열린다.
  - e2e: `history.e2e.ts` › "shift-dragging a commit onto another opens the rebase plan with it moved"
  - vitest: `src/rebasePlan.test.ts` › "moves a newer commit down to just after the target", "moves an older commit up past newer ones", "refuses no-op moves, commits off the line and the root"
- **I3 병합이 섞인 구간(`--rebase-merges`)** `자동` — 병합은 잠긴 줄, 순서는 같은 갈래 안에서만, 갈래 첫 커밋은 합칠 수 없음.
  - e2e: `history.e2e.ts` › "tidies a range with a merge in it: merges stay, commits move only within their line"
  - vitest: `src/rebasePlan.test.ts` › "groups picks into lines between merges, labels and resets", "reorders within a line, keeps the merges, and refuses a line that starts by melding"
  - cargo: `git/rebase.rs` › `reads_the_todo_git_writes_for_merges`, `plans_apply_within_runs_and_keep_the_merges`, `rewrites_a_range_with_a_merge`
- **I4 정리 중 충돌** `자동` — 중간에 멈추고 충돌 시트 → 계속/취소.
  - cargo: `git/rebase.rs` › `reordering_into_a_conflict_stops_mid_rebase`
  - e2e: `history.e2e.ts` › "a tidy-up stopped on conflicts names the sides for a rebase, and goes on or is cancelled"

### J. 지난 커밋 손보기

- **J1 메시지 고치기** `자동` — 이전 커밋·루트 커밋, 뒤 커밋과 로컬 변경 유지.
  - e2e: `commit.e2e.ts` › "rewords and splits a past commit, and restores a file as of a commit"
  - cargo: `git/edit.rs` › `rewords_an_older_commit_and_keeps_later_ones_and_local_changes`, `rewords_the_root_commit`, `reads_the_ui_shape`
- **J2 작성자 바꾸기** `자동`
  - cargo: `git/edit.rs` › `changes_the_author_of_one_commit`
  - e2e: `commit.e2e.ts` › "changes the author of a past commit and replays the commits after it"
- **J3 커밋 둘로 나누기(파일별)** `자동` — 파일 이름의 줄바꿈으로 명령 주입 불가.
  - e2e: `commit.e2e.ts` › "rewords and splits a past commit, and restores a file as of a commit"
  - cargo: `git/edit.rs` › `splits_a_commit_by_files`, `a_file_name_with_a_newline_cannot_inject_a_command`
- **J4 파일 하나를 어떤 커밋 상태로** `자동` — 그때 없던 파일이면 지움, 모르는 출처면 아무것도 안 지움.
  - e2e: `commit.e2e.ts` › "rewords and splits a past commit, and restores a file as of a commit"
  - cargo: `git/edit.rs` › `restores_a_file_as_of_a_commit_or_removes_it`, `restoring_from_an_unknown_source_deletes_nothing`
- **J5 손보기 실패 처리** `자동` — 훅이 거부하면 그대로, 브랜치 밖 커밋·빈 입력 거부.
  - cargo: `git/edit.rs` › `a_hook_that_refuses_the_edit_leaves_everything_as_it_was`, `refuses_commits_off_the_branch_and_empty_input`

### K. reset · reflog

- **K1 마지막 커밋 취소** `자동` — 변경은 스테이지된 채로 돌아온다.
  - e2e: `history.e2e.ts` › "undoes the last commit, goes back hard, then rescues the lost commit from the reflog"
  - cargo: `git/undo.rs` › `soft_reset_undoes_the_last_commit_but_keeps_its_changes_staged`
- **K2 여기로 리셋(soft/mixed/hard)** `자동` — hard는 커밋 안 한 변경 경고.
  - e2e: 위와 같음(hard)
  - cargo: `git/undo.rs` › `mixed_keeps_changes_unstaged_and_hard_throws_them_away`
- **K3 진행 중이면 거부** `자동`
  - cargo: `git/undo.rs` › `refuses_to_reset_mid_operation`
- **K4 reflog와 복구** `자동` — 탑바 '작업 기록', 닿지 않는 커밋 `lost` 표시, 브랜치로 살리기.
  - e2e: 위와 같음
  - cargo: `git/undo.rs` › `reflog_remembers_commits_a_hard_reset_left_behind`

### L. bisect

- **L1 범위 고르기·좋음/나쁨·원인·끝내기** `자동` — 후보 밖은 흐리게, 조준선, 붉은 노바.
  - e2e: `history.e2e.ts` › "hunts down the commit that broke something with bisect"
  - cargo: `git/bisect.rs` › `finds_the_commit_that_broke_it`
- **L2 건너뛰기** `자동`
  - cargo: `git/bisect.rs` › `skipping_leaves_the_commit_out_of_the_candidates`
  - e2e: `history.e2e.ts` › "skips a commit that can't be tested while bisecting"

### M. 파일 이력 · blame

- **M1 파일 이력** `자동` — 이름이 바뀌어도 따라감, 한글 파일 이름, 배너에서 더 예전/더 최근.
  - e2e: `history.e2e.ts` › "traces a file through history and shows who changed each line"
  - cargo: `git/history.rs` › `follows_the_file_across_a_rename`, `korean_file_names_come_back_as_they_are`
- **M2 blame** `자동` — 줄 묶음마다 커밋·작성자·시각, 오래될수록 붉게, 누르면 그 커밋으로.
  - e2e: 위와 같음
  - cargo: `git/history.rs` › `blames_each_line_on_the_commit_that_last_changed_it`
  - vitest: `src/components/History.test.ts` › "runs from a red giant (oldest) to a blue star (newest)", "treats a single age as newest and clamps outside the range"

### N. 브랜치 정리

- **N1 병합됨·사라짐(gone)·오래됨, 여러 개 삭제** `자동` — 병합된 것은 미리 골라짐, 병합 안 된 것은 한 번 더 확인.
  - e2e: `branches.e2e.ts` › "cleans up merged and gone branches from the sidebar"
  - cargo: `git/cleanup.rs` › `reports_merged_unmerged_and_gone_branches`, `deletes_many_and_refuses_unmerged_without_force`
  - vitest: `src/components/Cleanup.test.ts` › "puts merged first, then gone, then stale, and leaves active branches out"

### O. worktree

- **O1 목록·추가·탭으로 열기·제거** `자동` — 새 브랜치/기존 브랜치, 폴더 제안 `<원본 옆>/<저장소>-<브랜치>`, 지운 폴더는 prune.
  - e2e: `branches.e2e.ts` › "adds a worktree for a new branch, opens it in a tab, and removes it"
  - cargo: `git/worktree.rs` › `adds_lists_and_removes_worktrees`, `an_existing_branch_goes_out_and_a_deleted_folder_is_pruned`
- **O2 변경이 남은 worktree 제거** `자동` — 거부(`unmerged`) → '변경째 지우기' 확인.
  - cargo: `git/worktree.rs` › `adds_lists_and_removes_worktrees`
  - e2e: `branches.e2e.ts` › "removing a worktree with changes left in it asks again before deleting them"
- **O3 다른 worktree에 꺼낸 브랜치** `자동` — 폴더 표시, 체크아웃하면 그 탭을 연다.
  - e2e: `branches.e2e.ts` › "adds a worktree for a new branch, opens it in a tab, and removes it"

### P. 서브모듈

- **P1 상태·모두 업데이트·탭으로 열기** `자동` — 초기화 안 됨/최신/다른 커밋/변경 있음.
  - e2e: `branches.e2e.ts` › "lists submodules with their state, updates them, and opens one in a tab"
  - cargo: `git/submodule.rs` › `reads_and_updates_submodules`
- **P2 하나만 업데이트·sync·URL 복사·인증 실패** `자동`
  - cargo: `git/submodule.rs` › `reads_and_updates_submodules`(sync 포함)
  - e2e: `branches.e2e.ts` › "a submodule's menu updates it (saying when it needs sign-in), copies its URL and syncs"

### Q. LFS

- **Q1 상태·받기·추적** `자동` — 패턴, 받지 않은 파일 N개 받기, 형식 추가(`.gitattributes` 변경), 줄바꿈 든 패턴 거부.
  - e2e: `branches.e2e.ts` › "LFS: downloads files left as pointers and tracks a new file type"
  - cargo: `git/lfs.rs` › `reads_patterns_and_pointer_marks`, `tracks_patterns_and_finds_files_left_as_pointers`, `patterns_with_line_breaks_are_refused`
- **Q2 git-lfs 없음 안내·LFS 켜기·추적 해제** `자동`
  - cargo: `git/lfs.rs` › `tracks_patterns_and_finds_files_left_as_pointers`(install·untrack)
  - e2e: `branches.e2e.ts` › "LFS: turns LFS on for the repository, untracks a pattern, and says when git-lfs is missing"(`lfs` 제어값, 받기의 인증 실패 포함)
- **Q3 포인터 diff** `자동` — 포인터 대신 이전·이후 객체 크기와 oid.
  - vitest: `src/lfs.test.ts` › "reads a pointer and nothing else", "turns a pointer diff into before / after objects", "formats sizes"

### R. 저장소 들어오기와 탭

- **R1 URL로 clone** `자동` `+실기` — 진행률, 폴더 고르기, 최근 목록·즐겨찾기, 비어 있지 않은 폴더 거부.
  - e2e: `repos.e2e.ts` › "clones from a URL, remembers it in the repository menu and stars it"
  - cargo: `git/setup.rs` › `clones_a_local_repository_into_a_new_folder`, `clone_fails_cleanly_into_a_non_empty_folder_or_missing_parent`
  - vitest: `src/recent.test.ts` › "parses stored lists and drops broken entries", "moves a reopened repo to the front, keeps stars first and trims old ones", "names repositories from paths and URLs"
  - 실기: 실제 HTTPS 원격(GitHub 비공개 저장소)
- **R2 clone 인증 실패** `자동` `+실기` — 인증 실패를 따로 알려 기존 안내 창을 띄운다.
  - cargo: `git/setup.rs` › `clone_refused_by_the_server_is_classified_as_auth`(로컬 HTTP 서버: 401·403은 `Auth`, 404는 `Failed`, 폴더를 남기지 않음)
  - e2e: `repos.e2e.ts` › "a clone refused over SSH explains the setup in the app, and trying again reopens the clone"
- **R3 새 저장소(init)** `자동` — `main`으로 시작.
  - e2e: `repos.e2e.ts` › "creates a new repository in a plain folder"
  - cargo: `git/setup.rs` › `init_makes_an_empty_repository_on_main`
- **R4 폴더 열기·끌어다 놓기** `부분` `+실기` — 하위 경로를 놓아도 그 저장소를 찾는다.
  - cargo: `git/setup.rs` › `finds_the_repository_of_a_nested_path`
  - e2e: `repos.e2e.ts` › "opens repositories in tabs and keeps each tab's state"(폴더 열기)
  - 실기: Finder·탐색기에서 창에 끌어다 놓기
- **R5 탭** `자동` — 탭마다 상태 유지, 닫으면 이웃으로, 다시 켜면 복원, ⌘/Ctrl+T·W·1…9, Ctrl+Tab, ⌘/Ctrl+0(내 저장소).
  - e2e: `repos.e2e.ts` › "opens repositories in tabs and keeps each tab's state"; `safety.e2e.ts` › "a tab that crashes while rendering shows a notice, and the other tabs keep working"(Ctrl+T)
  - vitest: `src/tabs.test.ts` › "opens a path in its existing tab, the welcome tab, or a new one", "closes to the neighbour and never leaves zero tabs", "cycles with wrap-around and ignores out-of-range picks", "round-trips through storage without welcome tabs"; `src/planet.test.ts` › "is the same planet for the same repository, and varies between them"
  - e2e: `repos.e2e.ts` › "tabs follow the keyboard: new, by number, cycle, home and close, and come back after a reload"(데모는 `Tabs` 플래그가 있을 때만 탭을 기억한다)
- **R6 `ddugit <경로>` 실행 인자** `부분` `+실기`
  - cargo: `lib.rs` › `the_first_plain_argument_is_the_repository_to_open`(옵션은 건너뛰고 첫 인자를 절대 경로로)
  - 빈칸: 실제 앱이 그 저장소를 탭으로 여는지(Tauri 실행)
- **R7 첫 화면** `자동` — 폴더 열기·clone·새 저장소·GitHub·GitLab, 단축키 버튼.
  - e2e: `report.e2e.ts` › "the first screen offers every way in, and the shortcuts"

### S. 내 저장소(은하 대시보드)

- **S1 카드·신호·모두 Fetch** `자동` — 브랜치·upstream·신호(찾을 수 없음/멈춘 작업/변경/받을·보낼/보관함), 집계, 모두 Fetch(3개씩), 목록에서 지우기, 열기는 새 탭, 홈 탭은 지금 탭 위에.
  - e2e: `repos.e2e.ts` › "the galaxy dashboard reads every recent repository and fetches them all"
  - vitest: `src/galaxy.test.ts` › "reads a repository's signals, most urgent first", "tallies worlds per signal and picks what fetch-all reaches"
  - cargo: `git/glance.rs` › `reads_where_each_repository_stands`, `counts_upstream_distance_and_stashes`
- **S2 그룹** `자동` — 만들기·옮기기·모두 열기·풀기, 제안(같은 소유자·같은 폴더), 여러 장 고르기, 띠 사이 끌기, 저장소 메뉴의 그룹, 탭 위 그룹 색.
  - e2e: `repos.e2e.ts` › "groups repositories on the dashboard: create, move in, open all, ungroup", "groups: a suggestion by owner, picking several cards, and dragging between bands", "groups show in the repository menu, and grouped tabs carry the group's colour"; `safety.e2e.ts` › "a malformed stored list of dismissed hints doesn't break the dashboard"
  - vitest: `src/groups.test.ts` › "parses stored groups and drops broken or repeated ones", "adds, renames, recolours, folds and reorders", "puts repositories in one group at a time and lays out bands", "keeps the group through reopening, storage and trimming", "reads the owner from forge URLs", "offers the biggest same-owner or same-folder set of ungrouped repositories", "reads nothing as empty"
- **S3 일괄 Pull·같은 이름 브랜치(Pro)** `자동` — ff만, 갈라진 것은 카드에 표시, 멈춘 저장소는 빼고 전환·생성.
  - e2e: `repos.e2e.ts` › "the dashboard pulls picked repositories and puts them all on the same branch", "on Free, batch pull and branch switching offer Pro"
  - vitest: `src/galaxy.test.ts` › "pulls only branches with an upstream, and switches none stopped mid-operation"
  - cargo: `git/write.rs` › `switch_or_create_takes_local_then_remote_then_makes_one`
- **S4 Free는 대시보드 3개** `자동` — 별표 먼저·최근 순 3개만 열리고 나머지는 잠김 + Pro 안내(`FREE_DASHBOARD`).
  - e2e: `repos.e2e.ts` › "on Free, the dashboard reads three repositories, starred first, and offers Pro for the rest"

### T. 백포트

- **T1 비교** `자동` — 브랜치 메뉴 '…에 없는 커밋 보기', 미반영/반영됨/가져옴 구분, 개수.
  - e2e: `pro.e2e.ts` › "backports a missing commit and then counts it as applied"
  - cargo: `git/backport.rs` › `classifies_missing_applied_and_picked`
- **T2 사이드바 진입과 안내** `자동` — 받는 쪽 = 현재 브랜치, 가져올 쪽 추정, 4단계 안내(접으면 기억).
  - e2e: `pro.e2e.ts` › "opens backport from the sidebar with a guide, into the current branch"
- **T3 원본을 원격으로 추가해 비교** `자동`
  - e2e: `pro.e2e.ts` › "adds the original project as a remote and lists its fixes to backport"
- **T4 제외(받는 쪽별)·대상별 요약** `자동`
  - e2e: `pro.e2e.ts` › "ignores are per target and the overview counts each branch"
  - cargo: `git/backport.rs` › `ignores_are_per_target_and_summary_counts_each`, `ignore_then_apply_the_rest`
- **T5 일괄 cherry-pick(Pro)** `자동`
  - e2e: `pro.e2e.ts` › "backports a missing commit and then counts it as applied", "on Free, private pull requests and backport actions offer Pro instead"
- **T6 패치 내보내기(Pro)** `자동`
  - cargo: `git/backport.rs` › `exports_numbered_patches`
  - e2e: `pro.e2e.ts` › "exports picked backport commits as numbered patches into a chosen folder"

### U. 폐쇄망 반출입(Pro)

- **U1 반출** `자동` — 받는 곳별 지난 반출 이후만, 새 것이 없으면 알림, `.sha256`, 반출 기록.
  - e2e: `pro.e2e.ts` › "air-gapped transfer writes only what a destination lacks, and imports a bundle as remote branches"
  - cargo: `git/transfer.rs` › `bundles_carry_only_what_the_destination_lacks_and_import_in_order`, `checksums_are_sha256sum_hex`; `digest.rs` › `matches_sha256sum`
- **U2 반입** `자동` — 검사(체크섬, 빠진 선행 커밋) 후 `refs/remotes/<이름>/`로, 번들 이름에서 받는 곳 추정.
  - e2e: 위와 같음(정상 번들); `pro.e2e.ts` › "a bundle with a bad checksum or missing prerequisite commits is not imported"(`nextBundle`)
  - cargo: `git/transfer.rs` › `a_changed_bundle_is_refused`, `names_are_checked`
  - vitest: `src/transfer.test.ts` › "takes the destination out of a ddugit bundle name, even with dashes in the repository", "keeps any other name whole"
- **U3 Free 잠금** `자동`
  - e2e: `pro.e2e.ts` › "on Free, air-gapped transfer offers Pro"

### V. 스택 브랜치(Pro)

- **V1 쌓기·뒤처짐·다시 쌓기·빼기** `자동`
  - e2e: `pro.e2e.ts` › "a stacked branch falls behind when the branch below moves, and restacking puts it back on top"
  - cargo: `git/stack.rs` › `restacking_replays_only_each_branchs_own_commits_after_an_amend`
  - vitest: `src/stack.test.ts` › "lists each stack from its lowest branch, children under their parent", "branches off the same parent stay in one stack"
- **V2 squash 병합된 부모·순환·이름 변경** `자동`
  - cargo: `git/stack.rs` › `a_squash_merged_parent_hands_its_children_to_main`, `loops_are_refused_and_renames_follow`
- **V3 Free 잠금** `자동`
  - e2e: `pro.e2e.ts` › "on Free, stacking a branch offers Pro"

### W. 릴리스 노트(Pro)

- **W1 직전 태그부터 종류별 묶기·Markdown 복사** `자동` — 첫 부모 줄, PR 없는 병합은 들여온 커밋, 기타 빼기, 첫 커밋부터, 손으로 고친 내용 복사.
  - e2e: `pro.e2e.ts` › "release notes group the commits since the previous tag by kind, and copy as Markdown"
  - cargo: `git/changelog.rs` › `notes_start_at_the_previous_tag_and_follow_the_first_parent`
  - vitest: `src/notes.test.ts` › "reads the type, scope and pull request of squash and merge commits", "puts breaking changes first and untyped messages under other; plain merges say nothing", "expands a plain branch merge into the commits it brought in", "knows GitHub and GitLab remotes in any URL form", "groups by kind, oldest first, with links when the forge is known", "leaves other out on request and says so when nothing is left"
- **W2 Free 잠금** `자동`
  - e2e: `pro.e2e.ts` › "on Free, release notes offer Pro"

### X. GitHub · GitLab

- **X1 PR·MR 목록** `자동` `+실기` — head 커밋 라벨(# / !), CI·리뷰 상태, 닫힘·병합 접기, 우클릭(브라우저·그래프·체크아웃), 토큰 없음·거절 시 연결 안내, 토큰 저장·지우기.
  - e2e: `remote.e2e.ts` › "lists open pull requests, checks one out, and connects or forgets a forge token"
  - vitest: `src/components/Pulls.test.ts` › "uses # on GitHub, ! on GitLab, and names the remote when there are several forges", "labels only commits in the loaded history and maps a label back to its PR", "carries CI for the label color and the review for its mark", "asks for a token when none is found or the saved one was refused", "links to a token page with just the needed scope"
  - cargo: `forge.rs` › `parses_remote_urls_of_every_shape`, `graphql_endpoints_cover_enterprise_and_self_hosted`, `maps_ci_and_review_states`, `reads_github_pulls_with_their_checks_and_review`, `reads_gitlab_merge_requests_and_flags_refused_tokens_and_errors`
  - 실기: 실제 GitHub·GitLab API 응답(가짜 서버로만 시험함)
- **X2 토큰 출처와 호스트 신뢰** `부분` `+실기` — `gh`/`glab` 토큰 → OS 키체인, CLI 토큰은 github.com·gitlab.com 또는 믿기로 한 호스트에만, 토큰은 webview로 넘기지 않음.
  - cargo: `forge.rs` › `only_the_public_forges_get_a_cli_token_unasked`, `reads_the_hosts_gh_and_glab_are_signed_in_to`, `remote_hosts_must_be_plain_host_names`; `http.rs` › `error_statuses_come_back_with_their_body`, `encodes_query_values`
  - cargo: `keychain.rs` › `only_the_device_id_inherits_the_legacy_device_id`
  - 빈칸: 옛 `ddugit` 서비스에서 옮겨 오기 자체. macOS·Windows 밖에서 keyring의 대체 저장소는 항목마다 값을 따로 들고 있어(같은 서비스·계정이어도 나누지 않는다) 임시로도 재현할 수 없다. 실기로 본다
  - 실기: macOS 키체인·Windows 자격 증명 관리자에 저장되고 다시 켜도 남는지
- **X3 PR·MR 만들기** `자동` `+실기` — 브랜치 메뉴·PR 섹션 머리, 받을 브랜치 = API의 기본 브랜치, 제목·설명 채우기, 초안, 안 올린 브랜치는 먼저 push, 이미 열림은 링크, 토큰 먼저.
  - e2e: `createPr.e2e.ts` › "creates a pull request from a branch menu, pushing the branch first", "creating a pull request asks for a token first, and offers Pro on Free"
  - vitest: `src/prDraft.test.ts` › "collects the commits the head has and the base lacks, newest first", "lists a remote's branches and picks the default one as base", "titles a one-commit request after its commit, and a longer one after the branch", "says when the branch must be pushed first"
  - cargo: `forge/create.rs` › `builds_rest_urls_for_every_host`, `request_bodies_mark_drafts_each_forges_way`, `reads_forge_errors_as_one_line`, `opens_a_github_pull_request_and_reads_the_project`, `an_existing_request_comes_back_with_its_link_and_refusals_ask_for_a_token`, `a_remote_off_the_forges_has_no_target`
  - 실기: github.com·gitlab.com에 실제로 만들어지는지
- **X4 내 저장소에서 clone** `자동` `+실기` — clone 창 출처(URL/GitHub/GitLab), 검색, 비공개 표시, HTTPS/SSH, 서버 주소 바꾸면 Enterprise·자체 GitLab, 출처·프로토콜 기억.
  - e2e: `repos.e2e.ts` › "clones one of my GitHub repositories by searching for it", "a self-managed GitLab asks to connect before listing repositories"
  - vitest: `src/forgeRepos.test.ts` › "keeps the forge's order without a query", "ranks segment-start name matches, then name, then description", "needs every word, in the name or description", "names a remote after the owner", "picks the URL for the protocol", "lists URL first, then each forge once"
  - cargo: `forge.rs` › `lists_the_users_repositories_with_one_query`; `forge/repos.rs` › `normalizes_hosts_as_typed`, `reads_github_repositories`, `reads_gitlab_projects_and_counts_internal_as_private`, `an_untrusted_host_without_a_saved_token_asks_for_one`
- **X5 원격 추가 창의 GitHub 탭** `자동` — 소유자 이름으로 원격 이름.
  - e2e: `remote.e2e.ts` › "adds a remote from the GitHub tab, named after the owner"
- **X6 Pro 경계(비공개·회사 서버 PR)** `자동` — 공개 저장소의 github.com·gitlab.com만 Free.
  - e2e: `pro.e2e.ts` › "on Free, private pull requests and backport actions offer Pro instead"
  - cargo: `forge/create.rs` › `free_covers_only_public_repositories_on_the_public_forges`

### Y. SSH

- **Y1 SSH 준비 4단계** `자동` `+실기` — HTTPS↔SSH 주소 전환, 키 만들기(ed25519, 600), 공개키 복사, 서버 지문을 GitHub·GitLab 공개 지문과 비교해 known_hosts에 추가, 연결 확인. 묻지 않음(`BatchMode`).
  - e2e: `repos.e2e.ts` › "sets up SSH for a clone inside the app: key, host trust, test"
  - cargo: `ssh.rs` › `finds_the_ssh_host_of_a_remote`, `reads_fingerprints_and_checks_the_published_ones`, `reads_who_the_server_greeted`, `makes_a_key_and_lists_it_with_its_public_half`, `fingerprints_a_scanned_key`
  - vitest: `src/sshUrl.test.ts` › "switches between the HTTPS and SSH forms of a forge address", "recognises SSH addresses and their host"; `src/shell.test.ts` › "picks PowerShell on Windows, a POSIX shell elsewhere", "quotes so nothing expands", "leaves plain words alone and quotes the rest", "takes host names only"
  - 실기: 실제 github.com·gitlab.com 연결, Windows OpenSSH(ssh-agent 서비스), 암호 걸린 기존 키
- **Y2 인증 실패 창의 SSH 패널** `자동` — SSH 원격에서 인증 실패 시 같은 4단계 패널.
  - e2e: `repos.e2e.ts` › "a clone refused over SSH explains the setup in the app, and trying again reopens the clone"

### Z. 커밋할 사람과 서명

- **Z1 프로필** `자동` — 설정에서 만들기(이메일 검사), 첫 프로필은 전역 값에서 제안, 커밋 창 이름 줄 메뉴로 이 저장소·전역에 적용, 전역 따르기, 값이 온 곳 표시.
  - e2e: `commit.e2e.ts` › "identity: a profile made in settings is applied to the repository from the composer"
  - vitest: `src/identity.test.ts` › "keeps well-formed profiles and drops broken entries", "is read as part of the settings", "names what is wrong", "shows name <email>, where it comes from and whether commits are signed", "flags a missing name or email", "matches by name and email, and by signing for the full match", "makes a profile from the current identity", "adds, replaces in place and folds duplicates"
  - cargo: `git/identity.rs` › `parses_config_with_scopes_last_one_winning`, `applies_and_clears_a_profile_in_the_repo`, `writes_global_style_config_to_the_given_file_and_refuses_bad_values`
- **Z2 서명 키 제안** `자동` `+실기` — GPG 비밀 키·SSH 공개 키 목록.
  - cargo: `git/identity.rs` › `parses_gpg_secret_keys`
  - e2e: `commit.e2e.ts` › "identity: the signing key field suggests the GPG and SSH keys found on this computer"
  - 실기: 실제 gpg 키링·`~/.ssh`
- **Z3 서명 배지** `자동` `+실기` — 서명됨/서명됨(확인 안 됨)/없음, 서명자.
  - e2e: `commit.e2e.ts` › "inspector: shows whether a commit is signed"
  - cargo: `git/identity.rs` › `parses_signature_codes`, `reads_the_signature_of_unsigned_and_ssh_signed_commits`
  - 실기: GPG로 서명한 커밋(`%G?` = G), GitHub의 Verified와 같은지
- **Z4 서명 실패 안내** `자동` `+실기` — gpg·ssh 서명 실패를 알아보고 안내.
  - vitest: `src/identity.test.ts` › "recognizes gpg and ssh signing failures"
  - e2e: `commit.e2e.ts` › "a commit refused while signing explains what signing needs"(`signFail`)
  - 실기: gpg-agent·pinentry가 뜨는 환경에서 앱이 멈추지 않는지

### AA. 설정 · 단축키 · 언어

- **AA1 설정 항목** `자동` — 반짝임·우주 배경·빛 번짐, git 실행 파일(이름이 `git`/`git.exe`인 절대 경로, `--version` 확인 후 적용), 실행 전 확인, 저장값 파싱.
  - e2e: `settings.e2e.ts` › "settings: shortcut table, sparkles and git path"
  - vitest: `src/settings.test.ts` › "falls back to defaults for missing or broken data", "keeps valid fields and drops invalid ones", "respects reduced motion by default"
  - cargo: `git/mod.rs` › `git_program_is_validated_before_use`, `git_programs_a_clone_could_plant_are_refused`; `proc.rs` › `reads_what_a_program_prints`
  - e2e: `settings.e2e.ts` › "settings: a smaller history size reads the repository again with fewer commits"
- **AA2 설정 창 구성** `자동` — 섹션 목록(클릭·화살표), `Segmented`(화살표, Tab 한 번).
  - e2e: `dialogs.e2e.ts` › "settings: the section list switches sections, by click and by arrow keys", "a segmented switch moves with the arrow keys, one Tab stop for the group"
- **AA3 단축키 표** `자동` — `?`로 열기, 마우스 동작은 글자로, 입력 중에는 단축키 무시.
  - e2e: `dialogs.e2e.ts` › "? opens settings at the shortcut table; Esc closes it"; `settings.e2e.ts` › "settings: shortcut table, sparkles and git path"
  - vitest: `src/keys.test.ts` › "is true for fields, selects and editable content", "is false for everything else"
- **AA4 언어(시스템/한국어/English)** `자동` `+실기` — 바꾸면 바로 바뀌고 저장, `lang` 속성, 두 사전의 키·자리표시자 일치, 조사·복수.
  - e2e: `settings.e2e.ts` › "settings: switching to English relabels the app and is remembered"
  - vitest: `src/i18n/i18n.test.ts`(15개: "translate every key with the same placeholders and markup", "write English plurals as two forms instead of (s)", "use particle placeholders instead of 을(를)-style fallbacks", josa·fill·plural 묶음); `src/format.test.ts` › "says how long ago in the largest whole unit"
  - 실기: 영어 OS에서 '시스템'이 English로, 잘린 영어 문구가 없는지 눈으로

### AB. 앱 업데이트

- **AB1 알림·설치·나중에** `부분` `+실기` — 시작할 때와 6시간마다 확인, 탑바 위 알림, '업데이트하고 다시 시작', 서명 확인, `requireSignedVersion`.
  - e2e: `settings.e2e.ts` › "a newer version shows an update notice that installs or waits"
  - vitest: `scripts/downloads.test.mjs` › "lists the two installers", "refuses a release missing an installer", "points every platform at its signed update file", "is absent without the update files or their signatures"
  - cargo: `update.rs` › `a_build_without_an_address_never_updates`, `updates_must_be_signed_by_the_release_key`(`tauri.conf.json`의 공개키·`requireSignedVersion`, 플랫폼 파일이 덮어쓰지 않음)
  - 빈칸: 확인·내려받기·설치(`find`·`install`)는 `AppHandle`과 서명된 업데이트 서버가 있어야 해서 실기로
  - 실기: 0.8.0 → 새 버전 실제 업데이트(4장)

### AC. Free / Pro

- **AC1 판정** `자동` — 라이선스가 없으면 첫날부터 Free(체험 없음), 유효하면 Pro, 지난·다른 기기 것은 Free.
  - cargo: `pro.rs` › `without_a_license_it_is_free_from_the_first_day`, `an_active_license_opens_pro_and_a_lapsed_or_foreign_one_does_not`; `license.rs` › `a_device_bound_license_opens_pro_only_on_its_device`
- **AC2 화면의 잠금과 Pro 안내** `자동` — PRO 표시, 안내 창(닫기·'이미 구매했어요' → 설정의 라이선스), 대화상자 위에서 Esc.
  - e2e: `pro.e2e.ts` › "on Free, private pull requests and backport actions offer Pro instead", "on Free, air-gapped transfer offers Pro", "on Free, stacking a branch offers Pro", "on Free, release notes offer Pro"; `repos.e2e.ts` › "on Free, batch pull and branch switching offer Pro"; `createPr.e2e.ts` › "creating a pull request asks for a token first, and offers Pro on Free"; `dialogs.e2e.ts` › "on Free, the Pro offer over a dialog closes with Esc, then the dialog"
  - e2e: `repos.e2e.ts` › "on Free, the dashboard reads three repositories, starred first, and offers Pro for the rest"(S4)
- **AC3 백엔드 잠금(`pro::require`)** `자동` — 화면을 거치지 않아도 백포트 실행·반출입·스택·일괄 전환 명령이 Free에서 거부된다(`lib.rs`).
  - cargo: `lib.rs` › `pro_commands_are_refused_on_free_before_touching_anything`(Pro 명령 9가지: 거부 문구, 참조·HEAD·로컬 config·작업 트리·내보낼 폴더가 그대로), `pro_commands_work_with_a_license`(테스트 키로 서명한 사이트 라이선스), `taking_a_branch_out_of_its_stack_stays_free`. 명령 본문(`<명령>::run`)에 설정 폴더를 직접 넘긴다

### AD. 라이선스

- **AD1 붙여 넣기(폐쇄망·사이트)** `자동` — 형식 오류, 이름·업데이트 기간 표시, 지우기, 서명 위조·다른 키 거부, 기간 안 버전만.
  - e2e: `settings.e2e.ts` › "settings: a commercial license is pasted, shown and removed"
  - cargo: `license.rs` › `a_signed_license_checks_offline_and_reads_back`, `a_tampered_or_foreign_license_is_refused`, `a_license_covers_versions_released_during_its_update_period`, `dates_come_out_as_calendar_days`, `a_license_with_an_expiry_lapses_after_it_and_a_site_license_never_does`, `licenses_without_expiry_or_plan_still_read`, `a_lifetime_license_covers_every_version_and_never_lapses`, `the_public_key_is_32_base64url_bytes`, `installs_a_license_issued_by_the_script`(환경 변수가 있을 때만)
- **AD2 ddugit.com 로그인으로 활성화** `자동` `+실기` — 루프백(`127.0.0.1:<포트>`)에서 기다리며 브라우저 열기, state 확인, 그만두기, 평생·기기 3대 표시.
  - e2e: `settings.e2e.ts` › "settings: Pro is activated by signing in on ddugit.com, and the wait can be cancelled"
  - cargo: `activate.rs` › `the_callback_with_our_state_gives_the_code`, `another_state_is_refused_and_waiting_goes_on`, `a_state_token_is_long_and_url_safe`
- **AD3 이 기기에서 해제** `자동` `+실기` — 확인 후 해제, 오프라인이어도 여기서는 지우고 사이트에서도 지우라고 안내.
  - e2e: `settings.e2e.ts` › "settings: a device-bound license is removed from this device and Pro closes"
  - cargo: `activate.rs` › `deactivating_removes_the_license_here_whatever_the_site_says`
- **AD4 시작할 때·하루마다 확인** `자동` `+실기` — 지운 기기(`removed`)·환불(`revoked`)이면 내려놓고 알림, 오프라인이면 유지.
  - e2e: `settings.e2e.ts` › "a device removed on ddugit.com loses its license at the next check"
  - cargo: `license.rs` › `a_removed_or_refunded_lifetime_license_is_dropped_and_offline_keeps_it`
- **AD5 기기 ID** `부분` `+실기` — 설정 폴더 `device-id` + 키체인, 키체인 우선, 서버에는 SHA-256만, 기기 이름 정리.
  - cargo: `device.rs` › `a_new_id_is_made_once_and_kept_in_both_places`, `the_keychain_wins_and_fills_a_missing_copy`, `the_hash_is_sha256_hex_of_the_id_text`, `device_names_are_cleaned_and_short`(키체인은 가짜)
  - 실기: 실제 키체인, 앱을 지웠다 다시 깔아도 같은 기기로 남는지

### AE. 문제 신고

- **AE1 신고 보내기** `자동` `+실기` — 설정 → 정보 → 문제 신고, 진단 정보(요금제·git 버전·OS), 복사(오프라인 대안), 속도 제한 메시지, 입력 유지.
  - e2e: `report.e2e.ts` › "a report from settings → About is sent with redacted diagnostics"
  - cargo: `report.rs` › `body_matches_the_site_contract`, `body_checks_what_the_site_would_refuse`, `outcome_reads_the_sites_answer`
  - vitest: `src/report.test.ts` › "lists the facts without anything that names the user's work", "puts the reply address between the description and the diagnostics"
  - 실기: 실제 `/api/report` → `/admin`
- **AE2 문의** `자동` — 진단 정보는 고를 때만.
  - e2e: `report.e2e.ts` › "a question leaves diagnostics out unless asked"
- **AE3 오류 토스트의 '신고'와 가리기** `자동` — 예상 못 한 오류에만 버튼, 경로·URL·이메일·토큰 가리기.
  - e2e: `report.e2e.ts` › "an unexpected error toast offers a report with the error, redacted"
  - vitest: `src/report.test.ts` › "keeps the newest entries, oldest first", "skips empty errors and keeps stacks of Error objects", "knows a toast that repeats a fresh command failure", "does not offer reports for cancellations or the Pro line"; `src/redact.test.ts` › "paths: %s"(4가지), "URLs, with or without credentials in them", "emails", "tokens", "git message: %s"(실제 출력 표), "keeps commit ids, versions, times and plain words"
- **AE4 정보 화면과 링크** `자동` — 버전·OS·아키텍처, https 링크만 연다.
  - e2e: `report.e2e.ts` › "a report from settings → About is sent with redacted diagnostics"
  - cargo: `about.rs` › `app_info_names_this_build`, `only_web_links_open`
- **AE5 복사·링크 열기 실패 알림** `자동` — 클립보드·브라우저 열기가 실패하면 토스트(`share.ts`).
  - vitest: `src/share.test.ts` › "copies and reports done, or shows a failure when the clipboard refuses or is missing", "opens links through the backend and shows why one could not be opened"
  - e2e: `commit.e2e.ts` › "inspector: copies the commit id, lists the branches holding it, and says when copying fails"(거부된 클립보드 → 토스트)

### AF. 첫 실행과 Git 없음

- **AF1 항해 일지(튜토리얼)** `자동` — 미션 6개, 순서 상관없이 체크, 진행 저장, 닫아도 데모 표시로 다시 열기.
  - e2e: `settings.e2e.ts` › "the tutorial voyage ticks off missions as they are done, and can be closed and reopened"
  - vitest: `src/missions.test.ts` › "completes missions in any order and points at the first one left", "reads stored progress, dropping unknown missions and junk"
- **AF2 Git을 찾을 수 없어요** `자동` `+실기` — 시작할 때 안내, 'Git 내려받기'에 포커스, 'Git 위치 지정' → 설정의 Git.
  - e2e: `report.e2e.ts` › "a missing git is reported at startup with a way to fix it"
  - 실기: Git이 없는 새 Windows

### AG. 오류 경계와 안전

- **AG1 탭이 그리다 죽으면** `자동` — 그 탭만 안내, 다른 탭은 동작, 신고에 오류 포함, 탭 다시 불러오기.
  - e2e: `safety.e2e.ts` › "a tab that crashes while rendering shows a notice, and the other tabs keep working"
- **AG2 깨진 저장값** `자동` — localStorage가 깨져도 기본값으로.
  - e2e: `safety.e2e.ts` › "a malformed stored list of dismissed hints doesn't break the dashboard"
  - vitest: 각 `parse*` 테스트(settings·recent·groups·identity·missions)
- **AG3 CSP·`freezePrototype`** `부분` `+실기` — `default-src 'self'`, IPC만 연결, 인라인 스크립트 없음. 실제 앱(Xvfb 또는 macOS·Windows)에서 콘솔에 CSP 위반이 없는지.
  - cargo: `lib.rs` › `the_release_window_runs_only_its_own_scripts`(설정값과 플랫폼 파일이 덮어쓰지 않음)
  - 빈칸: 실제 앱 콘솔의 CSP 위반(실기)

### AH. 키보드와 대화상자

- **AH1 Esc** `자동` — 저장소 메뉴·사이드바에서 연 대화상자, 시트, 시트 위 메뉴는 메뉴만, 두 겹이면 맨 위만, 메뉴를 닫아도 고른 커밋 유지.
  - e2e: `dialogs.e2e.ts` › "Esc closes the repository menu and the dialogs opened from the sidebar", "Esc closes sheets, and a menu over a sheet closes alone", "Esc closes only the topmost of two dialogs"; `safety.e2e.ts` › "Esc that closes a menu keeps the selected commit"
- **AH2 포커스** `자동` — Tab은 모달 안에서만, 닫으면 연 버튼으로.
  - e2e: `dialogs.e2e.ts` › "Tab stays inside a modal dialog, and focus goes back to the opener"
- **AH3 바깥 클릭** `자동` — 대화상자에서 시작한 드래그를 바깥에서 놓아도 안 닫힘, 바깥에서 시작한 클릭은 닫힘.
  - e2e: `safety.e2e.ts` › "a selection dragged out of a dialog onto the scrim keeps the dialog open"
- **AH4 팝업 퇴장 애니메이션** `없음` — 자동화 브라우저에서는 일부러 꺼진다(`leaving.ts`). 눈으로 확인.

### AI. 창과 레이아웃

- **AI1 작은 창** `자동` — 최소 900×560(`tauri.conf.json`)에서 탑바·사이드바·시트·설정·대시보드가 넘치지 않음.
  - e2e: `history.e2e.ts` › "keeps the diff and the conflict sheet usable in a small window"(1024×680)
  - e2e: `safety.e2e.ts` › "the smallest window (900×560) keeps every screen inside it, controls unclipped and apart"(탑바·사이드바·그래프·커밋 창·rebase 시트·설정·대시보드)
- **AI2 창 테두리** `부분` `+실기` — macOS 신호등이 탭 줄 위, Windows 창 버튼(최소화·최대화·닫기), 탭 줄 빈 곳 끌기·더블클릭 최대화, 가장자리 크기 조절. Linux·데모는 시스템 제목 표시줄.
  - vitest: `src/chrome.test.ts` › "draws its own frame only in the desktop app on macOS and Windows"

### AJ. 큰 저장소 성능

- **AJ1 커밋 100,000개·참조 600개** `부분` `+실기` — 3,000개 읽기 0.1초 안팎, `buildScene` 수 ms, 그리기 1~2ms, 50,000줄 파일 diff 0.4초([PERF.md](PERF.md)의 기준).
  - cargo: `git/read.rs` › `snapshot_bench`, `git/diff.rs` › `diff_bench`(`#[ignore]`, 수동)
  - vitest: `src/graph/scene.test.ts`, `src/graph/runs.test.ts`(색인 정확성만); `src/lru.test.ts` › "drops the least recently used entry past its size", "setting a key again refreshes it", "deletes only the value it was given, if any"
  - 실기: 실제 큰 저장소를 열어 스크롤·확대·검색·이전 이력 더 불러오기

### AK. 설치와 배포

- **AK1 macOS dmg** `없음` `+실기` — 서명·공증, Gatekeeper 경고 없음(`release.yml`이 빌드 뒤 `codesign`·`spctl`·`stapler`를 돌린다).
- **AK2 Windows exe** `없음` `+실기` — SmartScreen '추가 정보 → 실행', 설치·시작 메뉴·제거.
- **AK3 downloads.json·latest.json** `자동` `+실기` — 두 설치 파일, 서명된 업데이트 파일.
  - vitest: `scripts/downloads.test.mjs`(AB1과 같음)
  - 실기: 사이트 다운로드 페이지가 새 버전을 보여 주는지

## 3. 사이트(ddugit.com) 점검표

사이트 테스트는 `node --test`(파일 › "이름")다. 사이트 화면·Supabase·Lemon Squeezy는 자동 테스트가 없어서 수동 단계로 적는다.

14항목: `부분` 8(W-2·3·4·5·7·8·9·10), `없음` 6(W-1·6·11·12·13·14). 모든 항목에 수동 단계가 있다.

- **W-1 가격 페이지** `없음` — Free / Pro 비교, $29(`PRO_PRICE`), 기기 3대, 사이트 라이선스 문의. `NEXT_PUBLIC_LS_CHECKOUT_URL`이 없으면 "Available soon".
  - 수동: `/pricing`을 넓은 창·휴대폰 폭에서 열어 가격·버튼 확인
- **W-2 결제(/checkout → Lemon Squeezy → /thanks)** `부분` — 로그인 안 했으면 로그인 후 돌아옴, 로그인 이메일이 `checkout[email]`·`checkout[custom][email]`로.
  - node:test: `src/lib/checkout.test.ts` › "the signed-in email fills in the checkout and rides along as custom data", "the link's own parameters stay; no email, no change"
  - 수동: 테스트 모드로 끝까지 사기(4.4 전 준비)
- **W-3 로그인(GitHub·Google)** `부분` — `/auth/callback`, 돌아갈 곳은 이 사이트 경로만, 이메일 가입·익명 로그인 꺼짐(README의 Auth 설정 체크박스).
  - node:test: `src/lib/activate.test.ts` › "after signing in, only paths on this site"
  - 수동: 두 공급자로 로그인·로그아웃, 로그인 뒤 원래 페이지(`/activate`·`/checkout`)로 돌아오는지
- **W-4 /activate 흐름** `부분` — 앱이 보낸 port·state·device·name 확인, 라이선스 고르기(이 기기에 있는 것 → 자리 있는 것, 최신 순), active만, 테스트 주문은 허용할 때만, 1회용 코드는 해시만 저장, 오래된 앱은 "Update ddugit first", 라이선스 없으면 "No ddugit Pro license", `Referrer-Policy: no-referrer`.
  - node:test: `src/lib/activate.test.ts` › "only a loopback port and a token-like state are accepted", "a device id is 32 bytes of base64url, and its name is cleaned up", "the activation page comes back with everything the app sent", "device ids are kept as the SHA-256 hex of their text", "a license has room for a device until max_devices; site licenses always do", "the license chosen is the one this device is on, else one with room, newest first", "only active licenses are chosen, of any kind; test orders only where allowed", "licenses are labelled by kind and plan"; `supabase/functions/_shared/license.test.ts` › "a code is traded only by the device it was issued for"
  - 수동: 4.4
- **W-5 4번째 기기** `부분` — 가득 차면 "Your license is on 3 devices"와 기기 목록, 하나를 해제하고 활성화. DB 트리거 `devices_within_limit`가 한도를 지킨다.
  - node:test: `supabase/functions/_shared/license.test.ts` › "only site licenses are free of devices; three devices fill a license"
  - 수동: 4.6. 트리거는 자동 테스트 없음
- **W-6 /account** `없음` — 내 라이선스(종류·평생·테스트 주문 표시), 기기 목록(이름·마지막 확인), 기기 지우기, 관리자에게만 /admin 링크, 로그아웃.
  - 수동: 4.5·4.6
- **W-7 라이선스 API(/api/license/activate·deactivate·refresh)** `부분` — Next가 Supabase 함수로 넘김(크기 제한 1KB·8KB). 해제는 자기 라이선스와 기기 id로만. refresh: 행이 없거나 기기가 지워지면 `removed`, 못 쓰면 `expired`, 기기에 안 묶인 것의 행이 없으면 `unknown`.
  - node:test: `supabase/functions/_shared/license.test.ts` › "a signed license reads back, wrapped or not", "a tampered, foreign or garbled license is refused", "keys in the formats scripts/license.mjs writes (PKCS#8 PEM, base64url public)", "a lifetime license is signed for one device, with every update and no expiry", "every kind of license needs to be active; test orders only where allowed", "refresh: a missing row removes a device-bound license; an unusable one expires", "device ids are hashed as SHA-256 hex of their text", "a device is released only with its own license and device id"
  - 수동: 4.5·4.7(앱으로), 함수 로그에 오류 없는지
- **W-8 웹훅(ls-webhook)** `부분` — HMAC-SHA256 서명, `order_created` → 평생 라이선스(기기 3 × 수량, 로그인 이메일), `order_refunded` 전액 → `refunded`, 부분 환불·다른 상품·다른 이벤트 무시, 같은 주문은 한 행, 상품 id 없으면 500.
  - node:test: `supabase/functions/_shared/store.test.ts` › "only the HMAC-SHA256 of the exact body under the secret passes", "license ids look like the ones scripts/license.mjs makes", "a paid order makes a lifetime license for three devices", "the license goes to the ddugit login passed at checkout, when it is an email", "more copies, more devices; test mode is marked", "a full refund takes the license back; a partial one doesn't", "other events, unpaid orders and other products change nothing", "without product ids nothing makes a license; the setting is a comma-separated list"
  - 수동: Lemon Squeezy 테스트 모드 주문·환불, 웹훅 재전송(같은 행인지)
- **W-9 /contact와 /api/report** `부분` — 검사(종류·길이·이메일·허니팟), 전달 비밀이 맞을 때만, Netlify IP 헤더만 믿음, 보낸 사람당 시간당 5건·전체 200건, 413(64KB), 503(비밀 없음), 함수를 직접 부르면 403. IP·내용은 로그에 안 남김.
  - node:test: `src/lib/report.test.ts` › "the visitor's IP is Netlify's header only; headers a visitor can write are ignored", "the report function gets the forwarding secret, and the IP when known"; `supabase/functions/_shared/report.test.ts` › "a minimal report passes, with every optional field null", "a full report keeps its fields, trimmed, and ignores unknown ones", "blank optional fields count as absent", "kind, source and message are required and checked", "lengths are counted in characters, not UTF-16 units", "an email must look like one and fit in 254 characters", "the honeypot catches any non-empty website", "only the site's forwarded IP counts; proxy headers a caller can write don't", "a request counts as the site's only with the exact forwarding secret", "the sender hash is the salted SHA-256, never the IP", "five reports per sender per hour, with a cap for everyone"
  - 수동: 4.8, `curl -X POST https://<ref>.supabase.co/functions/v1/report` → 403
- **W-10 /admin** `부분` — 관리자 아니면 404, 상태·종류·출처 필터, 상태별 개수, 펼쳐 보기, 답장 메일 링크(안전한 주소만), 상태 바꾸기·메모. 지우기는 API로 불가.
  - node:test: `src/lib/admin.test.ts` › "only known filter values survive the query string", "dashboard links keep the other filters and drop empty ones", "statuses are new, read and done", "an excerpt is the first line, cut at a character boundary"; `supabase/functions/_shared/email.test.ts` › "an email is one @ with a dotted domain and no spaces", "a reply address has no URL or header syntax", "the reply link is encoded and only for safe addresses"
  - 수동: 관리자 아닌 계정으로 `/admin` → 404, 4.8
- **W-11 보안 헤더** `없음` — 모든 응답에 CSP(`frame-ancestors 'none'; object-src 'none'; base-uri 'self'`), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS. `/activate`는 `no-referrer`.
  - 수동: `curl -sI https://ddugit.com/ https://ddugit.com/activate | grep -iE "content-security|x-frame|referrer|strict-transport|permissions|nosniff"`
- **W-12 다운로드 페이지** `없음` — OS 자동 감지, `downloads.json`의 최신 버전·크기, SmartScreen 안내.
  - 수동: macOS·Windows 브라우저에서 `/download`, 받은 파일 크기·버전
- **W-13 RLS와 권한(마이그레이션)** `없음` — 로그인한 사람은 자기 이메일의 라이선스·기기만 읽고 기기는 지우기만, anon은 아무것도 없음, `reports`는 관리자만 읽고 `status`·`note`만 고침.
  - 수동: SQL Editor에서 `set role authenticated; set request.jwt.claims = '{"email":"someone@else"}';` 후 `select * from licenses` → 0행 등
- **W-14 세션 갱신(proxy)·/api/status** `없음` — 로그인 페이지들이 matcher에 있음(`/account`, `/activate`, `/admin`, `/checkout`), `/api/status`가 Netlify 환경 변수 이름만 보여 줌.
  - 수동: 로그인 후 한 시간 넘게 둔 뒤 `/activate`의 Activate 버튼이 동작하는지, `/api/status`에 값이 아닌 이름·true/false만

## 4. 출시 전 사용자가 직접 할 확인

실제 macOS·Windows 기계와 실제 계정이 있어야 하는 것만 모았다. 위에서 아래로 한 번 하면 된다. 결과는 날짜와 함께 ROADMAP 작업 기록에 한 줄 남긴다.

### 4.0 준비

1. 기계: macOS 1대(Apple Silicon이면 좋음), Windows 10/11 1대(Git이 **없는** 상태로 시작하면 4.2를 한 번에 확인), 기기 한도 시험용 기계 2대 더(가상 머신도 된다. 기기 ID는 설정 폴더 `device-id` + 키체인이라 VM마다 다르다)
2. 계정: GitHub(비공개 저장소 1개, 공개 저장소 1개), GitLab.com(프로젝트 1개), ddugit.com 로그인용 GitHub 또는 Google
3. 0.8.0 설치 파일(Supabase `releases/v0.8.0/` 또는 Actions artifact)과 새 버전 Release 실행 준비
4. Supabase SQL Editor에서 시험용 라이선스 행을 만든다(로그인 이메일로):
   ```sql
   insert into public.licenses (id, email, name, kind, plan, status, text)
   values ('lic_qa_test_1', '<로그인 이메일>', 'QA test', 'personal', 'lifetime', 'active', '');
   ```
   (`id`·`name`은 필수. `max_devices`는 기본 3. 열은 사이트 `supabase/migrations/`가 기준이고 NEXT.md의 '시험 행'과 같은 조건)

### 4.1 macOS 설치

1. ddugit.com/download를 Safari로 연다 → macOS 버튼이 먼저 보이는지, 버전이 최신인지
2. dmg를 열어 Applications로 끌고 실행 → "확인되지 않은 개발자" 경고 없이 열리는지. 터미널: `spctl -a -vv /Applications/ddugit.app`(source=Notarized Developer ID)
3. 신호등이 탭 줄 위에 겹쳐 있고 탭과 안 겹치는지, 탭 줄 빈 곳 끌기·더블클릭 최대화
4. 창을 최소 크기까지 줄여 탑바·사이드바·설정·충돌 시트가 넘치지 않는지
5. 저장소 폴더를 Finder에서 창으로 끌어다 놓기 → 탭으로 열림. 하위 폴더를 놓아도 그 저장소
6. 터미널에서 그 저장소에 커밋 → 1초 안에 그래프에 나타나는지(파일 감시)

### 4.2 Windows 설치

1. Edge로 ddugit.com/download → Windows 버튼, exe 받기 → SmartScreen "Windows의 PC 보호" → '추가 정보' → '실행'(사이트 안내 문구와 같은지)
2. 설치 → 시작 메뉴에 ddugit, 실행
3. Git이 없으면 "Git을 찾을 수 없어요" → 'Git 내려받기'가 git-scm.com을 여는지 → Git for Windows 설치 → 앱 재시작 또는 'Git 위치 지정'으로 `C:\Program Files\Git\cmd\git.exe`
4. 창 버튼(최소화·최대화·닫기), 가장자리 크기 조절, 탭 줄 끌기·더블클릭 최대화, Win+화살표 스냅
5. 한글·공백이 든 경로(`C:\Users\<이름>\문서\내 저장소`)를 열고 커밋·diff·파일 이력
6. 제어판에서 제거 → 다시 설치해도 라이선스(4.4 뒤라면)가 남는지

### 4.3 0.8.0 → 새 버전 자동 업데이트(macOS·Windows 각각)

1. 0.8.0을 설치하고 실행해 둔다(설정 → 정보에서 0.8.0)
2. 새 버전을 Release로 올린다(`latest.json`이 바뀜)
3. 0.8.0 앱을 다시 켠다 → 탑바 위 알림에 새 버전 → '나중에' → 알림이 사라지고 다시 켜면 또 뜨는지
4. '업데이트하고 다시 시작' → macOS는 재시작 후, Windows는 설치 프로그램이 앱을 닫고 다시 연 뒤 설정 → 정보가 새 버전인지
5. 업데이트 뒤에도 최근 저장소·탭·설정·라이선스가 그대로인지
6. 네트워크를 끊고 켜도 오류 토스트가 없는지

### 4.4 Pro 활성화(시험 라이선스 행)

1. 설정 → 라이선스 → 'ddugit.com 계정으로 활성화' → 브라우저가 `/activate`를 연다 → 로그인 → 'Activate'
2. 브라우저가 "done"을 보이고 앱은 "Pro 사용 중 · 평생 라이선스 · 평생 업데이트 · 기기 3대까지"
3. ddugit.com/account에 이 기기가 이름과 함께 보이는지
4. Pro 기능 하나씩: 백포트 cherry-pick, 폐쇄망 반출, 스택 쌓기, 릴리스 노트, 대시보드 4번째 저장소, 일괄 Pull
5. 활성화 중 '그만두기'를 누르면 브라우저에서 끝내도 앱이 받지 않는지

### 4.5 이 기기에서 해제

1. 설정 → 라이선스 → '이 기기에서 해제' → '해제' → Free
2. /account에서 그 기기가 사라졌는지
3. 다시 활성화 → 같은 기기로 다시 등록(새로 하나 더 늘지 않음)
4. 네트워크를 끊고 해제 → 앱에서는 지워지고 "ddugit.com/account에서도" 안내 → 네트워크를 켜고 /account에서 직접 지운다

### 4.6 4번째 기기

1. 기기 3대(4.0의 기계)를 모두 활성화
2. 4번째 기계에서 활성화 → `/activate`가 "Your license is on 3 devices"와 기기 목록
3. 목록에서 하나를 해제 → 4번째 기기 활성화 성공
4. 해제된 기기의 앱을 다시 켠다(또는 24시간 기다림) → "이 기기는 라이선스에서 해제됐어요" 토스트, Free
5. SQL로 `devices`에 네 번째 행을 직접 넣어 보면 트리거가 거부하는지

### 4.7 환불·회수

1. `update public.licenses set status = 'revoked' where email = '<로그인 이메일>';`
2. 앱을 다시 켠다 → Free로 내려가고 알림
3. `status = 'active'`로 되돌리고 다시 활성화
4. 시험이 끝나면 시험 행은 지우지 않고 `revoked`로 둔다(README)

### 4.8 문제 신고 → /admin

1. 앱: 설정 → 정보 → 문제 신고 → 내용·답장 이메일 → 보내기 → "보냈어요"
2. 진단 정보에 내 경로·원격 URL·이메일이 `<path>`·`<url>`·`<email>`로 가려졌는지
3. 같은 IP에서 6번째 신고 → "Too many reports. Try again later."가 창에 보이고 입력이 남는지
4. 사이트 /contact에서 문의 하나
5. ddugit.com/admin(관리자 계정)에 둘 다 보이는지, 버전·OS·진단 정보, 답장 링크, 상태 바꾸기·메모
6. 관리자가 아닌 계정으로 /admin → 404

### 4.9 실제 GitHub·GitLab

1. `gh auth login`이 된 기계: 비공개 저장소를 열면 PR 목록(Pro), CI·리뷰 상태가 github.com과 같은지. Free로 바꾸면 잠김, 공개 저장소는 Free에서도 보임
2. 아직 push 안 한 브랜치에서 'PR 만들기…' → '올리고 PR 만들기'(초안) → github.com에 초안 PR, 앱 목록에 #번호
3. 같은 브랜치로 한 번 더 → "이미 열려 있어요"와 링크
4. `gh`가 없는 기계: PR 섹션 'GitHub 연결' → 토큰 붙여 넣기 → 앱을 다시 켜도 연결 유지(키체인) → '저장된 토큰 지우기'
5. GitLab.com 프로젝트로 1~3 반복(MR, `!번호`)
6. clone 창 GitHub 탭: 내 저장소 목록·검색·비공개 표시 → HTTPS로 clone(macOS 키체인·Windows GCM이 묻고 기억하는지)
7. 틀린 자격 증명으로 Fetch → 인증 실패 안내 창이 뜨고 앱이 멈추지 않는지

### 4.10 SSH clone

1. `~/.ssh`에 키가 없는 기계(또는 사용자)에서 clone 창 → SSH → 'SSH 준비하기' → 키 만들기 → 공개키 복사 → GitHub Settings → SSH keys에 붙여 넣기
2. '서버 확인' → "github.com에서 공개한 지문과 일치해요" → '이 서버 신뢰' → '연결 확인' → "<사용자>로 인증됐어요"
3. SSH 주소로 clone → 커밋 → Push
4. Windows: OpenSSH 클라이언트로 같은 과정, ssh-agent 서비스가 꺼져 있어도 멈추지 않는지
5. 암호가 걸린 기존 키만 있는 경우: 묻지 않고 실패하며 안내가 뜨는지

### 4.11 커밋 서명

1. GPG: 설정 → 프로필 → 서명 방식 GPG, 키 제안 목록에 내 키 → 이 저장소에 적용 → 커밋 → 인스펙터 '서명됨' → push 후 GitHub에서 Verified
2. SSH 서명: 프로필에 SSH 공개 키 → 커밋 → '서명됨(확인 안 됨)' 또는 allowed signers가 있으면 '서명됨' → GitHub Verified(서명 키로 등록했을 때)
3. gpg-agent를 멈추거나 틀린 키 id → 커밋이 실패하고 서명 실패 안내, 앱이 멈추지 않는지
4. '전역 설정 따르기'로 되돌리면 서명 표시가 사라지는지

### 4.12 기타 실기

1. 큰 실제 저장소 하나(커밋 수만 개 이상)를 열어 확대·축소·검색·'이전 이력 더 불러오기'가 매끄러운지
2. LFS·서브모듈이 있는 실제 원격 저장소로 받기·업데이트
3. 영어 OS(또는 언어 '시스템')에서 English로 뜨고 잘린 문구가 없는지
4. 개발자 도구를 열 수 있는 빌드라면 콘솔에 CSP 위반이 없는지

## 5. 자동화할 빈칸

앱 쪽(데모 e2e·vitest)으로 만들 수 있던 빈칸은 2026-10-05에 채웠다(위 각 항목의 e2e·vitest). 남은 것:

1. **사이트 node:test 보안 헤더·다운로드** — `next.config.ts`의 `headers()` 결과가 모든 경로와 `/activate`에 기대한 값인지, `downloads.ts` 파싱(W-11, W-12)
2. **사이트 RLS 시험** — `supabase db test`(pgTAP)로 authenticated·anon 역할의 `licenses`·`devices`·`reports` 권한과 `devices_within_limit` 트리거(W-5, W-13)
3. **캔버스 그리기 검사(선택)** — 지금은 눈으로 본다(A2, A16의 점선). 화면 픽셀을 읽는 e2e는 테마·반짝임·글꼴에 흔들리기 쉬워 효과에 비해 비싸다

데모로는 만들 수 없어 실기에 남긴 것: 실제 창에 끌어다 놓기(R4, Tauri의 파일 끌기 이벤트)와 실행 인자(R6), 키체인(X2, AD5), 업데이터(AB1), 실제 앱의 CSP(AG3), 창 테두리(AI2), 큰 저장소의 속도(AJ1), 설치 파일(AK1, AK2). 팝업 퇴장 애니메이션(AH4)은 자동화 브라우저에서 일부러 꺼져 있어 눈으로 본다.
