# CLAUDE.md

ddugit: 그래프 중심의 크로스플랫폼(macOS / Windows) Git 클라이언트. Tauri 2(Rust) + React/TS + Canvas.

## 세션 시작 / 컨텍스트 압축 후 할 일

1. **[NEXT.md](NEXT.md)를 읽는다.** 지금 할 일과 막힌 것이 적혀 있다.
2. 전체 계획과 지난 작업은 [ROADMAP.md](ROADMAP.md)에서 본다.
3. 코드를 쓰기 전에 [CONVENTIONS.md](CONVENTIONS.md)를 따른다. 특히 응집도와 보일러플레이트 방지 규칙.

### 문서 갱신 규칙

| 문서         | 성격                                | 언제 갱신                                                             |
| ------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `ROADMAP.md` | **누적형**: 지우지 않고 체크·추가만 | 항목 완료 시 체크. 작업 단위가 끝날 때 맨 아래 작업 기록에 한 줄 추가 |
| `NEXT.md`    | **갱신형**: 매번 덮어씀             | 작업 단위가 끝날 때, 그리고 긴 작업 도중 중요한 결정·막힘이 생겼을 때 |

긴 작업 중에는 커밋하기 전에 NEXT.md를 먼저 갱신한다. 그래야 컨텍스트가 압축돼도 진행 상황이 커밋에 남는다.

## 명령

```bash
npm run dev                  # 브라우저 데모 모드 (가상 저장소, localhost:1420)
npm run tauri dev            # 데스크톱 앱 (뒤에 `-- -- <repo>`를 붙이면 그 저장소를 연다)
npm run check                # typecheck + eslint + prettier --check + vitest
npm run e2e                  # Playwright e2e on the demo (sandbox: PW_CHROMIUM=/opt/pw-browsers/chromium)
npm run format               # prettier --write
cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
```

Linux에서 Rust 빌드 시 webkit2gtk-4.1 등이 필요하다. `tauri::generate_context!` 때문에 `dist/`가 없으면 `mkdir -p dist`를 먼저 한다.

## 구조

- `src-tauri/src/git/`: git 계층. **읽기 = libgit2, 쓰기 = git CLI** (`mod.rs`의 `git()` 헬퍼. 실행 파일은 설정의 `set_program`으로 바꿀 수 있다. 이름이 `git`인 절대 경로만 받고, 저장소가 추적하는(무시되지 않는) 파일·임시 폴더·다른 사용자가 쓸 수 있는 파일은 거부한다)
  - `read.rs`: 스냅샷(이력, 참조, HEAD + upstream ahead/behind, 상태). 이력은 libgit2 정렬 revwalk(전체 이력을 먼저 읽는다) 대신 커밋 시각 순으로 직접 걷다가(`TimeWalk`) 페이지 크기에서 멈추고, `children_first`로 자식이 부모보다 앞에 오게 고친다
  - `write.rs`: commit/amend, merge, abort/continue, checkout, branch (`prepare_on`: 상태 확인 + 대상 체크아웃)
  - `pick.rs`: cherry-pick / revert
  - `rebase.rs`: interactive rebase (UI가 만든 todo를 `sequence.editor`로 넣는다. 편집기 없음). 병합이 섞이면 `--rebase-merges`: git의 todo를 먼저 받아(`todo`, 사본만 남기고 실패하는 편집기) 처리·갈래 안 순서만 바꿔(`apply_plan`) 넣는다. 화면의 같은 로직은 `rebasePlan.ts`의 `todoRuns`·`applyPlan`
  - `refs.rs`: 브랜치 이름 변경·삭제, 태그, 원격 브랜치 체크아웃, 원격 추가·삭제 (`RefOp` 태그 enum 하나)
  - `stash.rs`: discard, stash
  - `remote.rs`: fetch/pull/push (`RemoteOp` 테이블)
  - `watch.rs`: 파일 감시 (관련 경로만 걸러 `repo-changed` 이벤트, `lib.rs`의 `Watching` 상태가 하나만 유지)
  - `diff.rs`: 커밋 diff, 작업 트리 diff (`DiffScope`: all / unstaged / staged, `local_diff`는 스테이징과 hunk 순서를 공유)
  - `conflict.rs`: 충돌 파일 읽기(base / ours / theirs / 마커), 해결(Ours / Theirs / Content)
  - `stage.rs`: hunk·줄 단위 스테이지·내리기 (패치에서 hunk/줄만 골라 `git apply --cached`)
  - `bisect.rs`: `git bisect` 시작·좋음·나쁨·건너뛰기와 상태 읽기(refs/bisect/*에서 후보·지금 확인할 커밋·범인). 끝내기는 `write::abort`(bisect reset)
  - `edit.rs`: 지난 커밋 손보기(메시지·작성자·파일별로 둘로 나누기). 부모부터 rebase -i --autostash로 다시 쌓고 대상 바로 뒤에 `exec`을 끼운다. 훅(pre-commit 등)이 거부하면 rebase를 취소해 원래대로 돌리고 훅 출력을 돌려준다. 파일 하나를 어떤 커밋 상태로 되돌리기(`restore_file`)
  - `identity.rs`: 커밋할 사람과 서명(`user.name`·`user.email`·`commit.gpgsign`·`gpg.format`·`user.signingkey`)을 값이 온 곳(`--show-scope`)과 함께 CLI로 읽고, 저장소(local)·전역에 프로필 적용·서명 켜고 끄기·지우기(`IdentityOp`). GPG 비밀 키(`--with-colons`)·SSH 공개 키(`ssh::keys_in`) 목록, 커밋 하나의 서명(`%G?`·`%GS`·`%GK`, 확인 못 한 SSH 서명은 libgit2로 서명 유무). 프로필은 설정(`settings.profiles`, 순수 로직 `identity.ts`), 화면은 `components/Identity.tsx`(커밋 창의 이름 줄·메뉴, 설정의 프로필), 서명 배지는 `Inspector`
  - `history.rs`: 파일 이력(`log --follow`, 커밋마다 그때의 경로)과 blame(libgit2, 줄 묶음마다 커밋·작성자·시각)
  - `cleanup.rs`: 브랜치 정리 보고(기준 브랜치에 병합됨 / 원격에서 사라짐(gone) / 마지막 커밋 시각)와 여러 브랜치 한 번에 삭제
  - `undo.rs`: reset(soft/mixed/hard, 진행 중이면 거부), reflog(HEAD가 지나온 자리 + 어느 참조에서도 닿지 않는 `lost` 표시)
  - `setup.rs`: 저장소 들어오기: clone(진행률·인증 실패 구분), init(`main`), 경로가 속한 저장소 찾기(끌어다 놓기)
  - `worktree.rs`: worktree 목록(스냅샷의 `worktrees`, libgit2)과 추가·제거·정리(`WorktreeOp`). 화면은 `components/Worktrees.tsx`(사이드바 섹션·추가 창), 다른 worktree 폴더는 `onOpenPath`로 탭에 연다
  - `submodule.rs`: 서브모듈 상태(스냅샷의 `submodules`, libgit2)와 update(`--init --recursive`)·sync(`SubmoduleOp`). 화면은 `components/Submodules.tsx`
  - `lfs.rs`: Git LFS 상태(`git lfs` CLI: 설치·패턴·필터·받지 않은 파일)와 install/pull/track/untrack(`LfsOp`). 스냅샷과 따로 읽는다(셸 실행). 화면은 `components/Lfs.tsx`(사이드바 섹션, 포인터 diff), 순수 로직 `lfs.ts`
  - `glance.rs`: 여러 저장소를 이력 없이 한 번에 훑기(브랜치·upstream 거리·변경·멈춘 작업·보관함·마지막 커밋). 새 탭의 은하 대시보드(`components/Galaxy.tsx`, 순수 로직 `galaxy.ts`)가 쓴다. 대시보드 일괄 작업(Pro): 고른 카드·그룹을 한 번에 Pull(`--ff-only`)·같은 이름 브랜치로(`write::switch_or_create`), 대상 고르기는 `galaxy.ts`의 `pullable`·`switchable`
  - `backport.rs`: 두 브랜치(예: `upstream/main` ↔ 고객사 `main`) 사이 미반영 커밋 비교(`--cherry-mark` + `-x` 트레일러), 제외 표시(받는 쪽별 로컬 config), 대상별 요약, 일괄 cherry-pick, 패치 내보내기
  - `transfer.rs`: 폐쇄망 반출입(Pro). 받는 곳별로 지난 반출 이후만 담은 `git bundle` + `.sha256`, 반출 기록은 로컬 config `ddugit-transfer.<받는 곳>.sent`. 반입은 검사(체크섬·빠진 선행 커밋) 후 `refs/remotes/<이름>/`으로 가져온다. 화면은 `components/Transfer.tsx`(사이드바 로컬 브랜치 머리의 버튼), 순수 로직 `transfer.ts`
  - `stack.rs`: 스택 브랜치(Pro). 부모와 base(마지막으로 쌓은 부모 끝)를 로컬 config `branch.<이름>.ddugit-parent`·`ddugit-base`에 두고, 다시 쌓기는 스택 맨 아래부터 `rebase --onto <부모> <base> <브랜치>`(amend·squash된 부모의 옛 커밋을 다시 얹지 않는다). 화면은 `components/Stacks.tsx`(사이드바 섹션)와 브랜치 메뉴(`repo/menus.tsx`의 `stackItems`), 순수 로직 `stack.ts`
  - `changelog.rs`: 릴리스 노트(Pro, 화면에서 잠금). 두 리비전 사이 첫 번째 부모 줄의 커밋(PR당 하나)과, 병합마다 들여온 커밋(`inner`, PR 번호 없는 병합에 씀). 시작을 안 주면 직전 태그(`describe --tags <to>^`), 빈 문자열이면 첫 커밋부터. 묶기·Markdown은 순수 로직 `notes.ts`, 화면은 `components/ReleaseNotes.tsx`(태그·로컬 브랜치 메뉴)
- `src-tauri/src/forge.rs`: GitHub / GitLab의 열린 PR·MR(원격 URL로 forge 판별, 토큰은 `gh`/`glab` → OS 키체인, ureq). github.com·gitlab.com 밖의 호스트는 그 CLI 설정(`hosts.yml`·`config.yml`)에 로그인된 호스트일 때만 CLI 토큰을 쓴다(webview가 정하지 않는다). 원격 URL의 호스트는 `normalize_host`로 검사한다. 키체인 서비스는 `keychain.rs`(forge 토큰 `ddugit-forge`, 기기 ID `ddugit-device`, 옛 `ddugit`에서 옮겨 온다). 토큰은 webview로 넘기지 않는다. `forge/repos.rs`: 로그인한 사용자의 저장소 목록(clone·원격 추가에서 고르기, `components/ForgeRepoPicker.tsx`, 순수 로직 `forgeRepos.ts`의 `FORGE_SOURCES`·검색). `forge/create.rs`: PR·MR 만들기(REST, 기본 브랜치·비공개 확인 후 POST, 이미 열림은 기존 링크). 화면은 `components/CreatePr.tsx`(브랜치 메뉴·PR 섹션 머리), 순수 로직 `prDraft.ts`
- `src-tauri/src/ssh.rs`: SSH 준비(키 목록·생성, 호스트 키 지문을 GitHub·GitLab 공개 지문과 비교해 known_hosts에 추가, 연결 확인). 시스템 OpenSSH, 프롬프트 없음
- `src-tauri/src/update.rs`: 앱 자동 업데이트(tauri-plugin-updater). 확인 주소는 빌드 때 `DDUGIT_UPDATE_URL`(Supabase의 `latest.json`, 없으면 업데이트 안 함), 서명 공개키는 `tauri.conf.json`. 화면은 `components/Update.tsx`(시작할 때와 6시간마다 확인)
- `src-tauri/src/pro.rs`: Free / Pro 판정(이 기기의 유효한 라이선스 또는 사이트 라이선스, 체험 없음). Pro 경계: 비공개·회사 서버 저장소의 PR 연동(`forge::report`의 `locked`), 백포트 실행·폐쇄망 반출입·스택 쌓기·대시보드 일괄 브랜치 전환(`pro::require`), 대시보드 3개 초과·릴리스 노트·일괄 Pull(화면). 화면 쪽은 `src/pro.ts`(상태 공유, `offerPro`)와 `components/ProOffer.tsx`
- `src-tauri/src/license.rs`: 라이선스를 오프라인 검증(Ed25519, 공개키는 빌드 때 `DDUGIT_LICENSE_PUBKEY`). 산 라이선스는 평생(`plan: lifetime`, `updatesUntil` 9999-12-31)이고 기기 하나에 서명된다(`device` = 기기 ID의 SHA-256, 다르면 `otherDevice`로 Pro 꺼짐). `refresh_in`은 시작할 때·하루마다(`License.tsx`의 `useLicenseCheck`) 묻고, 사이트에서 지운 기기(`removed`)·환불(`revoked`)이면 지운다. 기기 ID는 `device.rs`(32바이트 base64url, 설정 폴더 `device-id` + 키체인, 키체인 우선). 발급은 `scripts/license.mjs`, 절차·서명은 `docs/RELEASE.md`
- `src-tauri/src/activate.rs`: ddugit.com 로그인으로 Pro 활성화(RFC 8252 루프백). `127.0.0.1:<임의 포트>`에서 기다리며 브라우저로 `ddugit.com/activate?port&state&device&name`을 열고(사이트가 기기를 3대까지 등록), 돌아온 1회용 코드와 기기 ID를 `/api/license/activate`에서 이 기기용 라이선스로 바꿔 `license::install_in`. `deactivate_in`은 `/api/license/deactivate`로 자리를 비우고 결과와 상관없이 여기서 지운다. 붙여 넣기는 폐쇄망·사이트 라이선스용으로 남는다. 화면은 설정 → 라이선스(`components/License.tsx`)
- `src-tauri/src/report.rs`: 문제 신고·문의를 `ddugit.com/api/report`로 POST(`activate::post` 공유, 사이트와 같은 길이·이메일 검사). `about.rs`: 앱 버전·OS·아키텍처(`app_info`)와 열 수 있는 링크(https만). 화면은 `components/Report.tsx`(설정 '정보', 신고 창, 'Git을 찾을 수 없어요' 안내). 진단 정보는 순수 로직 `src/report.ts`(세션 오류 로그: 명령 실패는 `api.ts`의 `call`이, 잡히지 않은 오류는 `captureErrors`가 넣는다. `isUnexpected`가 토스트의 '신고' 버튼을 정한다)와 `src/redact.ts`(경로·URL·이메일·토큰 가리기)
- `src-tauri/src/lib.rs`: Tauri 명령. `command!` 매크로로 한 줄씩 선언하고, 로직은 `git/`에 둔다. Pro 전용은 `command!(pro …)`(여기서 거부), 설정 폴더(라이선스)가 필요하면 `command!(이름(…) in dir -> …)`. 외부 프로그램은 `proc::hidden`(stdin 닫음, Windows 콘솔 창 없음)으로 띄운다
- `src/api.ts`: 백엔드 호출의 유일한 통로. `Commands` 표 하나로 Tauri와 데모(`src/mock/`)가 같은 명령을 구현한다. 새 명령은 Rust `command!`, `Commands`, mock(영역에 맞는 `src/mock/*.ts`의 `…Commands`) 세 곳에 추가한다.
- `src/mock/`: 데모 백엔드. `index.ts`가 영역별 명령 표(`app`·`local`·`history`·`refs`·`remote`·`pro`)를 합쳐 `mock`을 내보낸다(빠진 명령은 타입 오류). 가상 저장소와 응답 헬퍼는 `repo.ts`, e2e·개발용 스위치(`window.__ddugitDemo`, 타입 `DemoControls`)와 로드 전 플래그(`DemoFlags`, e2e의 `demoFlags`)는 `controls.ts`
- `src/types.ts`: Rust 구조체와 1:1로 대응한다.
- `src/recent.ts`: 최근 저장소·즐겨찾기 목록(순수 함수). 저장소 그룹은 `src/groups.ts`(폴더형: 저장소마다 그룹 하나, 대시보드 띠 `bands`). `components/Connect.tsx`가 저장(`useRecent`)과 화면(저장소 메뉴, 첫 화면 목록, clone 창)을 맡는다
- `src/settings.ts`: 사용자 설정(localStorage, 파싱은 순수 함수)과 단축키 표. 단축키를 바꾸면 `SHORTCUTS`도 고친다.
- `src/graph/`: `layout`(DAG → 레인) → `scene`(월드 경로) → `renderer`(그리기) → `GraphCanvas`(입력·카메라), `Minimap`. `scene`은 간선의 경계 상자와 행 묶음 색인(`edgesInRows`)만 미리 만들고, 경로(`Path2D`)는 처음 그릴 때 만든다(`shapeOf`). 렌더러는 화면에 걸친 행의 간선·노드·접힌 구간만 그린다. 그리기는 바뀔 때만: 그린 것이 바뀌면(props·카메라·호버·크기) `wake`로 프레임을 하나 청하고, 움직이는 동안(카메라 이동·✦·새 커밋)만 계속 그린다. 상태를 바꾸는 입력 처리기는 `wake.current()`를 부른다. 미니맵은 그래프가 그릴 때 뷰포트가 움직였으면 그린다(`MinimapHandle`). 큰 저장소 측정과 다시 재는 법은 [docs/PERF.md](docs/PERF.md). 화면 회전은 `View.r`(90° 단위) 하나로, 월드 ↔ 화면 변환은 늘 `toScreen`/`toWorld`/`viewAt`을 거친다(좌표를 직접 `* k + tx`로 계산하지 않는다)
- `src/components/`: 패널과 다이얼로그. 모달은 `Modal.tsx` 하나로 만든다(scrim + `useDialog` + `.dialog-title` + `.dialog-actions`, scrim에서 시작한 클릭만 닫는다). 키가 바뀔 때 다시 읽는 비동기 값은 `useLoaded(key, load)`(늦게 온 다른 키의 답은 버린다, `last`는 다시 읽는 동안 이전 값). localStorage는 `src/storage.ts`(`readStored`·`writeStored`, 실패해도 던지지 않는다), 창 전체 키 처리의 '입력 중'·'보이는 탭' 검사는 `keys.ts`(`isTypingTarget`·`isOnScreen`). 긴 목록(diff 줄, 시트·인스펙터의 파일 목록)은 줄 높이를 CSS로 고정하고 `virtual.ts`(`useVisibleRows`)로 화면 근처 줄만 그린다. `Pulls.tsx`는 PR을 그래프 라벨용 가짜 ref(`kind: "pr"`)로 바꾸고 사이드바 섹션·토큰 창을 맡는다. `Fx.tsx`는 결과 순간의 우주 연출(효과 큐, 충돌 성운)
- `src/App.css`: 스타일의 입구. 영역별 파일(`src/styles/`: base·welcome·shell·sidebar·stage·panels·sheets·settings·fx·features)을 `@import`한다. 순서가 곧 cascade이므로 바꾸지 않는다
- `e2e/`: Playwright e2e (`*.e2e.ts`). 데모 모드를 대상으로 돌리고, `fixtures.ts`의 `demo`로 데모 상태를 읽거나 바꾼다(`window.__ddugitDemo`, 타입이 붙어 있다). 로드 전 플래그(Free, 업데이트, git 없음, 라이선스, 탭 기억)는 `demoFlags(page, …)`. 페이지 오류가 하나라도 나면 실패한다
- 창 테두리: `src/chrome.ts`가 데스크톱 앱의 OS를 보고 정한다. macOS는 `tauri.macos.conf.json`(신호등을 탭 줄 위에 겹침), Windows는 `tauri.windows.conf.json`(`decorations: false`, 탭 줄 끝 `components/WindowControls.tsx`), Linux·데모는 시스템 제목 표시줄. 탭 줄의 빈 곳은 `data-tauri-drag-region`(창 끌기·더블클릭 최대화). 플랫폼 설정 파일은 창 객체 전체를 다시 적는다(배열은 통째로 바뀐다)
- `src/App.tsx`: 창(탭 셸). 탭(`tabs.ts`, 순수 함수), 설정, 저장소 연결(clone·init·끌어다 놓기), 알림. 탭마다 `RepoView`를 띄워 두고 안 보이는 탭은 `hidden`으로 숨긴다(상태 유지). 단축키 중 창 전체 것(탭, `?`)은 여기서 처리한다
- `src/RepoView.tsx`: 저장소 하나의 화면 조립(탑바·사이드바·그래프·오른쪽 패널). 보이는 탭(`active`)만 키 입력·파일 감시·탑바를 갖는다. 조각은 `src/repo/`에 있고, 모두 `state.ts`의 `Repo`(스냅숏·`run`·열린 시트/창 setter 등을 묶은 값)를 받는다
  - `useSnapshot.ts`(스냅숏 읽기·순서 번호·감시·포커스), `useRun.tsx`(모든 git 작업이 거치는 `run()`: 한 번에 하나, 바쁨·토스트·새로고침), `useRemote.tsx`(fetch/pull/push·원격 추가와 그 확인·인증·갈라짐 창, 진행 카드)
  - 열린 것은 판별 유니온 하나씩: 그래프 아래 시트 `Sheet`(`useSheet.ts`: diff 파일·rebase todo 읽기, 충돌 시트는 그 위에 따로), 저장소 창 `Dialog`(`Dialogs.tsx`), 원격 창(`useRemote` 안). 그리기는 `Sheets.tsx`·`Dialogs.tsx`
  - `actions.tsx`: 메뉴·배너·시트가 시작하는 흐름(이름 묻기 `askName`, 확인 `confirmThen`, 체크아웃·cherry-pick·reset·커밋 손보기·worktree 등). `menus.tsx`: 오른쪽 클릭 메뉴(참조·커밋·파일·원격·PR·worktree·서브모듈, 탑바 브랜치 목록). `Banners.tsx`: bisect·파일 이력·진행 중 작업 배너. `useBisect.ts`: bisect 상태·배지

## Git 워크플로우

**GitHub Flow + Conventional Commits + squash merge.**

- `main`: 항상 빌드와 테스트가 통과하는 상태. 직접 push하지 않고 PR로만 들어간다.
- 작업 브랜치: `<type>/<짧은-주제>`. 예: `feat/remote-ops`, `fix/lane-overlap`, `docs/roadmap`
  - Claude Code 세션은 세션이 지정한 브랜치(예: `claude/...`)를 그대로 쓴다.
- **ROADMAP 항목 하나 = 브랜치 하나 = PR 하나.** PR은 작게 만든다.
- 커밋 메시지: [Conventional Commits](https://www.conventionalcommits.org/), 영어, 명령형
  - 형식: `type(scope): summary`
  - type: `feat` `fix` `refactor` `perf` `test` `docs` `chore` `ci` `style`
  - scope 예: `graph` `git` `ui` `diff` `remote` `mock` `ci`
  - 예: `feat(remote): add fetch/pull/push with ahead/behind badges`
- PR: `.github/pull_request_template.md`를 채운다. CI가 통과해야 merge한다. merge는 squash로 한다.
  - CI는 **PR에서만, 바뀐 쪽만** 돈다. `ci-web.yml`(web + e2e)은 `src/`·`e2e/`·설정이 바뀔 때 돌고, `ci-rust.yml`(ubuntu: fmt·clippy·test)은 `src-tauri/`가 바뀔 때 돈다. 문서만 바꾸면 아무것도 돌지 않는다. main push에서는 다시 돌지 않는다(같은 커밋이 squash로 들어가기 때문)
  - macOS·Windows Rust 빌드는 비싸다(분당 10배·2배). 릴리스 전에 Actions에서 "CI · Rust"를 수동 실행(`all_os`)한다
  - push는 로컬 검사를 모두 통과시킨 뒤 PR당 가능한 한 한 번만 한다. CI가 10분 넘게 멈추면 취소하고 한 번 다시 돌린다
- 앱 아이콘·워드마크: 원본은 `design/brand/`(README에 사용 규칙: 48px 이하는 small 아이콘, 워드마크 높이 20px 이상, 색 부분 변경 금지). `npx tauri icon design/brand/icon/ddugit-icon-1024.png -o src-tauri/icons`로 만든 뒤(android·ios 폴더는 지운다) 브랜드가 준 `icon.icns`(macOS 그리드)·`icon.ico`·작은 PNG(32·64·128·256)로 덮어쓴다. 파비콘 `public/icon.png`는 32px small 아이콘. 화면의 워드마크는 `components/Wordmark.tsx`(아웃라인 SVG, 색은 `--brand-ink`·`--brand-star`)
- 릴리스: `main`에 `vX.Y.Z` 태그(SemVer)를 push한다. 0.x 동안은 minor = 마일스톤. 태그를 push하거나, 태그를 push할 수 없으면(예: 세션 브랜치만 push되는 환경) `main`에서 Actions의 Release를 `release` 체크하고 수동 실행한다. `.github/workflows/release.yml`이 macOS universal `.dmg`(서명·공증)와 Windows NSIS `.exe`(서명 없음)를 만들어 Supabase Storage(`releases/v<버전>/`, `downloads.json`)에 올리고 artifact로도 남긴다. **GitHub Release는 만들지 않는다**(배포는 ddugit.com만). 배포 형식은 dmg/exe만 쓴다(`bundle.targets`). 버전은 `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` 세 곳을 함께 올린다
- push 전에 반드시 `npm run check`와 `cargo fmt --check && cargo clippy && cargo test`를 통과시킨다. UI 흐름을 바꿨으면 `npm run e2e`도 돌린다.

## 주의

- UI 문자열은 `src/i18n`의 사전(`ko.ts` 원본 + `en.ts`)에 두고 `t("key")`로 읽는다. 코드·주석·커밋은 영어.
- 렌더 루프(rAF) 안에서 매 프레임 `setState`를 부르지 않는다. 프레임 상태는 ref에 둔다.
- git CLI는 `GIT_TERMINAL_PROMPT=0`, 빈 `GIT_ASKPASS`, stdin을 닫은 상태로 실행한다. 프롬프트에서 멈추면 GUI가 굳는다. 원격에 닿는 명령(`mod.rs`의 `NETWORK`)은 사용자가 ssh 명령을 정하지 않았으면 `ssh -o BatchMode=yes`, HTTP는 1분 멈추면 끊는다(`network_guard`)
- 새 git 쓰기 작업에는 반드시 임시 저장소 테스트(각 `git/*.rs` 하단, `testutil` 사용)를 붙인다. 원격 작업은 로컬 bare 저장소로 테스트한다.
