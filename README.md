# otgit (옷깃)

그래프로 보고, 그래프로 다루는 Git 클라이언트. macOS · Windows (Linux도 빌드 가능).

- **그래프 중심 UX** — 시간은 왼쪽 → 오른쪽으로 흐르고, 브랜치는 네온 레인으로 표시됩니다.
- **HEAD 다음의 ＋ 노드** — 눌러서 변경 파일을 고르고 메시지를 쓰면 새 체크포인트(커밋)가 이어집니다. 새 브랜치로 갈라져 커밋할 수도 있습니다.
- **끌어서 병합** — 체크포인트(점)를 끌어 다른 브랜치의 끝에 놓으면 병합합니다. 이미 병합된 대상은 거부됩니다.
- **무한 확대/축소** — 커서 기준 줌, 시맨틱 줌(축소: 선과 점만 → 확대: 브랜치·태그·커밋 메시지), 미니맵.
- **네온 + 반짝임 흐름** — 선을 따라 과거 → 현재로 빛이 흐릅니다. 상단 ✦ 버튼으로 끌 수 있고, OS의 "동작 줄이기" 설정을 따릅니다.
- **Fetch / Pull / Push** — ahead/behind 배지. Pull이 갈라지거나 Push가 거부되면 병합/리베이스를 그림으로 보여주고 고르게 합니다.
- **diff 시트** — 커밋 상세의 파일이나 커밋 작성기의 파일 이름을 누르면 그래프 아래에서 diff가 올라옵니다 (`[` `]` 파일 이동).
- 브랜치 색은 이름 기준으로 고정되어 새로고침해도 바뀌지 않으며, main/master는 항상 첫 번째 레인에 놓입니다.

## 조작

| 동작               | 방법                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| 이동               | 빈 곳 드래그 · 휠(타임라인 스크롤) · Shift+휠(세로) · 트랙패드 두 손가락 |
| 확대/축소          | ⌘/Ctrl + 휠 · 트랙패드 핀치 · `+` / `-`                                  |
| 전체 보기 / HEAD로 | `0` / `H`                                                                |
| 커밋               | ＋ 노드 클릭 → 메시지 → ⌘/Ctrl + Enter                                   |
| 병합               | 점을 끌어 다른 브랜치 끝에 놓기                                          |
| 브랜치 집중        | 왼쪽 목록 클릭 (조상만 밝게) · 더블클릭 = 체크아웃                       |

## 개발

필요: Node 20+, Rust stable, 시스템 `git`. Linux는 [Tauri 사전 요구사항](https://tauri.app/start/prerequisites/)(webkit2gtk 4.1 등)이 필요합니다.

```bash
npm install
npm run tauri dev            # 데스크톱 앱
npm run tauri dev -- -- /path/to/repo   # 저장소를 바로 열기
npm run dev                  # 브라우저 데모 모드 (가상 저장소, http://localhost:1420)
npm run tauri build          # 설치 파일 (.dmg / .msi / .exe)
```

테스트:

```bash
npm test                     # 그래프 레이아웃 (vitest)
npm run typecheck
cd src-tauri && cargo test   # git 백엔드 (임시 저장소로 실제 commit/merge 검증)
```

## 구조

```
src/
  App.tsx               화면 구성, git 작업 연결
  api.ts                Tauri 명령 호출 (브라우저에서는 mock.ts 데모 저장소)
  graph/layout.ts       커밋 DAG → 레인 배치 (trunk = 0번 레인)
  graph/scene.ts        레인 배치 → 월드 좌표 경로, 빛 입자용 샘플
  graph/renderer.ts     Canvas 2D 네온 렌더러 (가시 영역만 그림)
  graph/GraphCanvas.tsx 줌/팬, 끌어서 병합, ＋ 노드
  graph/Minimap.tsx     전체 이력 미니맵
  components/           커밋 작성기, 커밋 상세, 병합 확인, 브랜치 목록
src-tauri/src/
  git/                  읽기 = libgit2, 쓰기 = git CLI (read / write / remote / diff)
  lib.rs                Tauri 명령 (command! 매크로)
```

쓰기 작업(commit / merge / checkout / branch)은 사용자의 `git`을 그대로 호출합니다. 그래서 hook, 인증, GPG 서명, LFS가 터미널과 똑같이 동작합니다.
