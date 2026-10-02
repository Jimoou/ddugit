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

- `src-tauri/src/git/`: git 계층. **읽기 = libgit2, 쓰기 = git CLI** (`mod.rs`의 `git()` 헬퍼. 실행 파일은 설정의 `set_program`으로 바꿀 수 있다)
  - `read.rs`: 스냅샷(이력, 참조, HEAD + upstream ahead/behind, 상태)
  - `write.rs`: commit/amend, merge, abort/continue, checkout, branch (`prepare_on`: 상태 확인 + 대상 체크아웃)
  - `pick.rs`: cherry-pick / revert
  - `rebase.rs`: interactive rebase (UI가 만든 todo를 `sequence.editor`로 넣는다. 편집기 없음)
  - `refs.rs`: 브랜치 이름 변경·삭제, 태그, 원격 브랜치 체크아웃, 원격 추가·삭제 (`RefOp` 태그 enum 하나)
  - `stash.rs`: discard, stash
  - `remote.rs`: fetch/pull/push (`RemoteOp` 테이블)
  - `watch.rs`: 파일 감시 (관련 경로만 걸러 `repo-changed` 이벤트, `lib.rs`의 `Watching` 상태가 하나만 유지)
  - `diff.rs`: 커밋 diff, 작업 트리 diff (`DiffScope`: all / unstaged / staged, `local_diff`는 스테이징과 hunk 순서를 공유)
  - `conflict.rs`: 충돌 파일 읽기(base / ours / theirs / 마커), 해결(Ours / Theirs / Content)
  - `stage.rs`: hunk·줄 단위 스테이지·내리기 (패치에서 hunk/줄만 골라 `git apply --cached`)
  - `bisect.rs`: `git bisect` 시작·좋음·나쁨·건너뛰기와 상태 읽기(refs/bisect/*에서 후보·지금 확인할 커밋·범인). 끝내기는 `write::abort`(bisect reset)
  - `edit.rs`: 지난 커밋 손보기(메시지·작성자·파일별로 둘로 나누기). 부모부터 rebase -i --autostash로 다시 쌓고 대상 바로 뒤에 `exec`을 끼운다. 파일 하나를 어떤 커밋 상태로 되돌리기(`restore_file`)
  - `history.rs`: 파일 이력(`log --follow`, 커밋마다 그때의 경로)과 blame(libgit2, 줄 묶음마다 커밋·작성자·시각)
  - `cleanup.rs`: 브랜치 정리 보고(기준 브랜치에 병합됨 / 원격에서 사라짐(gone) / 마지막 커밋 시각)와 여러 브랜치 한 번에 삭제
  - `undo.rs`: reset(soft/mixed/hard, 진행 중이면 거부), reflog(HEAD가 지나온 자리 + 어느 참조에서도 닿지 않는 `lost` 표시)
  - `setup.rs`: 저장소 들어오기: clone(진행률·인증 실패 구분), init(`main`), 경로가 속한 저장소 찾기(끌어다 놓기)
  - `glance.rs`: 여러 저장소를 이력 없이 한 번에 훑기(브랜치·upstream 거리·변경·멈춘 작업·보관함·마지막 커밋). 새 탭의 은하 대시보드(`components/Galaxy.tsx`, 순수 로직 `galaxy.ts`)가 쓴다
  - `backport.rs`: 두 브랜치(예: `upstream/main` ↔ 고객사 `main`) 사이 미반영 커밋 비교(`--cherry-mark` + `-x` 트레일러), 제외 표시(받는 쪽별 로컬 config), 대상별 요약, 일괄 cherry-pick, 패치 내보내기
- `src-tauri/src/forge.rs`: GitHub / GitLab의 열린 PR·MR(원격 URL로 forge 판별, 토큰은 `gh`/`glab` → OS 키체인, ureq). 토큰은 webview로 넘기지 않는다
- `src-tauri/src/ssh.rs`: SSH 준비(키 목록·생성, 호스트 키 지문을 GitHub·GitLab 공개 지문과 비교해 known_hosts에 추가, 연결 확인). 시스템 OpenSSH, 프롬프트 없음
- `src-tauri/src/license.rs`: 상업용 라이선스를 오프라인 검증(Ed25519, 공개키는 빌드 때 `DDUGIT_LICENSE_PUBKEY`). 발급은 `scripts/license.mjs`, 절차·서명은 `docs/RELEASE.md`
- `src-tauri/src/lib.rs`: Tauri 명령. `command!` 매크로로 한 줄씩 선언하고, 로직은 `git/`에 둔다.
- `src/api.ts`: 백엔드 호출의 유일한 통로. `Commands` 표 하나로 Tauri와 데모(`mock.ts`)가 같은 명령을 구현한다. 새 명령은 Rust `command!`, `Commands`, `mock` 세 곳에 추가한다.
- `src/types.ts`: Rust 구조체와 1:1로 대응한다.
- `src/recent.ts`: 최근 저장소·즐겨찾기 목록(순수 함수). `components/Connect.tsx`가 저장(`useRecent`)과 화면(저장소 메뉴, 첫 화면 목록, clone 창)을 맡는다
- `src/settings.ts`: 사용자 설정(localStorage, 파싱은 순수 함수)과 단축키 표. 단축키를 바꾸면 `SHORTCUTS`도 고친다.
- `src/graph/`: `layout`(DAG → 레인) → `scene`(월드 경로) → `renderer`(그리기) → `GraphCanvas`(입력·카메라), `Minimap`. 화면 회전은 `View.r`(90° 단위) 하나로, 월드 ↔ 화면 변환은 늘 `toScreen`/`toWorld`/`viewAt`을 거친다(좌표를 직접 `* k + tx`로 계산하지 않는다)
- `src/components/`: 패널과 다이얼로그. `Pulls.tsx`는 PR을 그래프 라벨용 가짜 ref(`kind: "pr"`)로 바꾸고 사이드바 섹션·토큰 창을 맡는다. `Fx.tsx`는 결과 순간의 우주 연출(효과 큐, 충돌 성운)
- `e2e/`: Playwright e2e (`*.e2e.ts`). 데모 모드를 대상으로 돌리고, `fixtures.ts`의 `demo`로 데모 상태를 읽거나 바꾼다(`window.__ddugitDemo`). 페이지 오류가 하나라도 나면 실패한다
- `src/App.tsx`: 창(탭 셸). 탭(`tabs.ts`, 순수 함수), 설정, 저장소 연결(clone·init·끌어다 놓기), 알림. 탭마다 `RepoView`를 띄워 두고 안 보이는 탭은 `hidden`으로 숨긴다(상태 유지). 단축키 중 창 전체 것(탭, `?`)은 여기서 처리한다
- `src/RepoView.tsx`: 저장소 하나의 화면 조립과 git 작업 흐름. 모든 작업은 `run()`을 거친다. 보이는 탭(`active`)만 키 입력·파일 감시·탑바를 갖는다

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
- 릴리스: `main`에 `vX.Y.Z` 태그(SemVer)를 push한다. 0.x 동안은 minor = 마일스톤. 태그를 push하면 `.github/workflows/release.yml`이 macOS universal `.dmg`와 Windows NSIS `.exe`를 만들어 **초안** Release에 올린다. 내용을 확인한 뒤 공개한다. 태그를 push할 수 없으면(예: 세션 브랜치만 push되는 환경) Actions에서 Release를 `release` 체크하고 수동 실행한다. 그러면 `v<버전>` 초안이 만들어지고, 공개할 때 GitHub가 태그를 만든다. 배포 형식은 dmg/exe만 쓴다(`bundle.targets`). 서명과 자동 업데이트는 나중에 한다. 버전은 `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` 세 곳을 함께 올린다
- push 전에 반드시 `npm run check`와 `cargo fmt --check && cargo clippy && cargo test`를 통과시킨다. UI 흐름을 바꿨으면 `npm run e2e`도 돌린다.

## 주의

- UI 문자열은 `src/i18n`의 사전(`ko.ts` 원본 + `en.ts`)에 두고 `t("key")`로 읽는다. 코드·주석·커밋은 영어.
- 렌더 루프(rAF) 안에서 매 프레임 `setState`를 부르지 않는다. 프레임 상태는 ref에 둔다.
- git CLI는 `GIT_TERMINAL_PROMPT=0`, stdin을 닫은 상태로 실행한다. 프롬프트에서 멈추면 GUI가 굳는다.
- 새 git 쓰기 작업에는 반드시 임시 저장소 테스트(각 `git/*.rs` 하단, `testutil` 사용)를 붙인다. 원격 작업은 로컬 bare 저장소로 테스트한다.
