# ddugit

그래프로 보고, 그래프로 다루는 Git 클라이언트. macOS · Windows (Linux도 빌드 가능).

- **그래프 중심 UX** — 시간은 왼쪽 → 오른쪽으로 흐르고, 브랜치는 네온 레인으로 표시됩니다.
- **HEAD 다음의 ＋ 노드** — 눌러서 변경 파일을 고르고 메시지를 쓰면 새 체크포인트(커밋)가 이어집니다. 새 브랜치로 갈라져 커밋할 수도 있습니다.
- **끌어서 병합 / 복사** — 체크포인트(점)를 끌어 다른 브랜치의 끝에 놓으면 병합하고, ⌥/Alt를 누른 채 놓으면 그 커밋만 복사(cherry-pick)합니다.
- **우클릭 메뉴** — 커밋: 브랜치·태그 만들기, cherry-pick, revert, amend, SHA 복사. 브랜치 배지·사이드바: 체크아웃, 병합, 이름 변경, 삭제, 태그. 원격 브랜치는 더블클릭으로 로컬 추적 브랜치를 만들어 이동합니다.
- **부분 커밋** — diff 시트의 "변경 / 스테이지됨" 탭에서 hunk마다 스테이지하고, 커밋 작성기에서 "스테이지된 변경만 커밋"합니다.
- **충돌 해결** — 충돌이 나면 그래프 아래에 해결 화면이 열립니다. 블록마다 현재 쪽 / 들어오는 쪽 / 둘 다를 고르고 "해결 완료"를 누르면 됩니다.
- **스태시 / 버리기** — 커밋 작성기에서 선택한 변경을 스태시에 보관하거나 버립니다. 스태시는 그래프에 마름모로 보입니다.
- **무한 확대/축소** — 커서 기준 줌, 시맨틱 줌(축소: 선과 점만 → 확대: 브랜치·태그·커밋 메시지), 미니맵.
- **네온 + 반짝임 흐름** — 선을 따라 과거 → 현재로 빛이 흐릅니다. 상단 ✦ 버튼으로 끌 수 있고, OS의 "동작 줄이기" 설정을 따릅니다.
- **Fetch / Pull / Push** — ahead/behind 배지와 진행률 표시. 인증이 안 돼 있으면 OS와 HTTPS/SSH에 맞는 설정 방법을 안내합니다. Pull이 갈라지거나 Push가 거부되면 병합/리베이스를 그림으로 보여주고 고르게 합니다.
- **diff 시트** — 커밋 상세의 파일이나 커밋 작성기의 파일 이름을 누르면 그래프 아래에서 diff가 올라옵니다 (`[` `]` 파일 이동).
- 브랜치 색은 이름 기준으로 고정되어 새로고침해도 바뀌지 않으며, main/master는 항상 첫 번째 레인에 놓입니다.

## 설치

[Releases](https://github.com/Jimoou/ddugit/releases)에서 받습니다.

- **macOS**: `ddugit_<버전>_universal.dmg` (Apple silicon과 Intel 모두 지원). 열어서 ddugit을 응용 프로그램으로 끌어 놓습니다.
- **Windows**: `ddugit_<버전>_x64-setup.exe`. 관리자 권한 없이 사용자 계정에 설치합니다.

아직 코드 서명을 하지 않았습니다. 처음 실행할 때 macOS에서는 앱을 우클릭 → **열기**, Windows에서는 SmartScreen에서 **추가 정보 → 실행**을 누릅니다.

## 조작

| 동작               | 방법                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| 이동               | 빈 곳 드래그 · 휠(타임라인 스크롤) · Shift+휠(세로) · 트랙패드 두 손가락 |
| 확대/축소          | ⌘/Ctrl + 휠 · 트랙패드 핀치 · `+` / `-`                                  |
| 전체 보기 / HEAD로 | `0` / `H`                                                                |
| 커밋               | ＋ 노드 클릭 → 메시지 → ⌘/Ctrl + Enter                                   |
| 병합               | 점을 끌어 다른 브랜치 끝에 놓기                                          |
| cherry-pick        | ⌥/Alt를 누른 채 점을 끌어 놓기 · 우클릭 메뉴                             |
| 검색               | ⌘/Ctrl+F → 메시지·작성자·SHA·브랜치, Enter / Shift+Enter로 이동          |
| 브랜치 집중        | 왼쪽 목록 클릭 (조상만 밝게) · 더블클릭 = 체크아웃                       |

## 개발

필요: Node 20+, Rust stable, 시스템 `git`. Linux는 [Tauri 사전 요구사항](https://tauri.app/start/prerequisites/)(webkit2gtk 4.1 등)이 필요합니다.

```bash
npm install
npm run tauri dev            # 데스크톱 앱
npm run tauri dev -- -- /path/to/repo   # 저장소를 바로 열기
npm run dev                  # 브라우저 데모 모드 (가상 저장소, http://localhost:1420)
npm run tauri build          # 이 OS의 설치 파일 (macOS: .dmg, Windows: NSIS .exe)
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
