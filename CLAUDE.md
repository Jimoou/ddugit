# CLAUDE.md

otgit(옷깃): 그래프 중심의 크로스플랫폼(macOS / Windows) Git 클라이언트. Tauri 2(Rust) + React/TS + Canvas.

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

- `src-tauri/src/git/`: git 계층. **읽기 = libgit2, 쓰기 = git CLI** (`mod.rs`의 `git()` 헬퍼)
  - `read.rs`: 스냅샷(이력, 참조, HEAD + upstream ahead/behind, 상태)
  - `write.rs`: commit/amend, merge, abort/continue, checkout, branch (`prepare_on`: 상태 확인 + 대상 체크아웃)
  - `pick.rs`: cherry-pick / revert
  - `refs.rs`: 브랜치 이름 변경·삭제, 태그, 원격 브랜치 체크아웃 (`RefOp` 태그 enum 하나)
  - `stash.rs`: discard, stash
  - `remote.rs`: fetch/pull/push (`RemoteOp` 테이블)
  - `watch.rs`: 파일 감시 (관련 경로만 걸러 `repo-changed` 이벤트, `lib.rs`의 `Watching` 상태가 하나만 유지)
  - `diff.rs`: 커밋 diff, 작업 트리 diff (`DiffScope`: all / unstaged / staged, `local_diff`는 스테이징과 hunk 순서를 공유)
  - `conflict.rs`: 충돌 파일 읽기(base / ours / theirs / 마커), 해결(Ours / Theirs / Content)
  - `stage.rs`: hunk 스테이지·내리기 (패치에서 hunk만 골라 `git apply --cached`)
- `src-tauri/src/lib.rs`: Tauri 명령. `command!` 매크로로 한 줄씩 선언하고, 로직은 `git/`에 둔다.
- `src/api.ts`: 백엔드 호출의 유일한 통로. `Commands` 표 하나로 Tauri와 데모(`mock.ts`)가 같은 명령을 구현한다. 새 명령은 Rust `command!`, `Commands`, `mock` 세 곳에 추가한다.
- `src/types.ts`: Rust 구조체와 1:1로 대응한다.
- `src/graph/`: `layout`(DAG → 레인) → `scene`(월드 경로) → `renderer`(그리기) → `GraphCanvas`(입력·카메라), `Minimap`
- `src/components/`: 패널과 다이얼로그
- `e2e/`: Playwright e2e (`*.e2e.ts`). 데모 모드를 대상으로 돌리고, `fixtures.ts`의 `demo`로 데모 상태를 읽거나 바꾼다(`window.__otgitDemo`). 페이지 오류가 하나라도 나면 실패한다
- `src/App.tsx`: 화면 조립과 git 작업 흐름. 모든 작업은 `run()`을 거친다.

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
- PR: `.github/pull_request_template.md`를 채운다. CI(web + e2e + rust × ubuntu/macos/windows)가 통과해야 merge한다. merge는 squash로 한다.
- 릴리스: `main`에 `vX.Y.Z` 태그(SemVer). 0.x 동안은 minor = 마일스톤.
- push 전에 반드시 `npm run check`와 `cargo fmt --check && cargo clippy && cargo test`를 통과시킨다. UI 흐름을 바꿨으면 `npm run e2e`도 돌린다.

## 주의

- UI 문자열은 한국어, 코드·주석·커밋은 영어.
- 렌더 루프(rAF) 안에서 매 프레임 `setState`를 부르지 않는다. 프레임 상태는 ref에 둔다.
- git CLI는 `GIT_TERMINAL_PROMPT=0`, stdin을 닫은 상태로 실행한다. 프롬프트에서 멈추면 GUI가 굳는다.
- 새 git 쓰기 작업에는 반드시 임시 저장소 테스트(각 `git/*.rs` 하단, `testutil` 사용)를 붙인다. 원격 작업은 로컬 bare 저장소로 테스트한다.
