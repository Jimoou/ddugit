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
- [x] `ddugit <경로>` 실행 인자

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
  - [x] 병합이 섞인 구간(`--rebase-merges`): git이 쓴 todo를 먼저 받아(편집기가 사본만 남기고 실패, git은 아무것도 시작하지 않음) 그 위에서 계획. 병합·label·reset은 그대로, 각 커밋의 처리(유지·합치기·버리기)는 자유, 순서는 같은 갈래(병합 사이의 커밋 줄) 안에서만. 갈래의 첫 커밋은 합칠 수 없음. 정리 시트에 병합은 잠긴 줄, 병합한 갈래는 구분선
  - [x] 정리한 뒤 강제 push: Push 거부 화면에 "덮어쓰기"(`--force-with-lease`)
- [x] GitHub / GitLab PR 연동 (그래프에 PR 상태 표시) — 2026-10-02 결정: 토큰은 `gh`/`glab` 로그인 먼저, 없으면 앱에서 받아 OS 키체인
  - [x] 열린 PR·MR을 head 커밋 라벨(⇄ #12 / !3)과 사이드바 PR 목록으로, 우클릭: 브라우저·그래프에서 보기·브랜치 체크아웃, 토큰 없음·거절 시 연결 안내와 토큰 만들기 링크
  - [x] CI 상태·리뷰 상태 표시: 라벨 색(초록 통과·빨강 실패·주황 진행 중), 승인 ✓·수정 요청 ✎, 사이드바 점·칩. GraphQL 한 번으로 PR 목록과 상태를 함께 받는다
  - [x] 닫힌·병합된 PR: 열린 PR과 함께 최근 병합·닫힌 것(GitHub 30개, GitLab 병합 20·닫힘 10)을 한 번의 GraphQL로 받아 사이드바 PR 섹션 아래 '닫힘·병합' 접기에(병합됨 보라·닫힘 회색). 그래프 라벨은 열린 PR만

## M7 · 첫인상과 읽기 — 2026-10-02 사용자 결정

- [x] 첫 실행 튜토리얼 "항해 일지": 데모 저장소에서 미션 6개(살펴보기·커밋·병합·되감기·bisect·push), 실제 작업이 일어나면 체크, 진행 저장, 닫아도 데모 표시로 다시 열기
- [x] 릴리스 초안 ddugit v0.2.0 (M6 마일스톤, 이름 변경 반영). 그 전에 "CI · Rust"를 `all_os`로 수동 실행한다 — 초안은 `80b2a07`(#46)에서 만들어졌다. 공개(Publish)와 예전 v0.1.0(otgit) 초안 삭제는 사용자가 한다
- [x] 자체 SVG 아이콘: 화면의 글자·이모지 아이콘(OS 글꼴마다 모양이 다름)을 한 세트(`icons.ts`, `components/Icon.tsx`)로 바꿨다. 그래프 라벨의 HEAD·원격·태그·PR·리뷰 표시는 같은 path를 Path2D로 그린다
- [x] 커밋 내용이 첫눈에: 대각선 요약 라벨(38°, 60% 이상에서 표시). 평행이라 서로 겹치지 않고, 아래 레인의 별이나 그 요약에 닿기 전에 멈춘다. 라벨이 없는 커밋은 자리가 더 있으면 위쪽 하늘로. 선택·호버한 커밋은 가로 전체 요약
- [x] 커밋 미리보기 카드: 별에 0.35초 머물면 요약·본문 앞 3줄·ID·작성자·시각·PR·바뀐 파일 5개와 +/− 막대. 오른쪽 끝에서는 왼쪽으로 뒤집힘, 클릭·끌기·휠·떠나기에 닫힘
- [x] 브랜치 맵 90° 단위 회전(0/90/180/270, 사용자가 고정). 글자는 늘 바로 서게. 세로 목록 보기 대신 이것으로 한다 — HUD 버튼과 `R`, 설정에 저장. 세로(90°/270°)에서는 커밋마다 한 줄이라 라벨과 요약을 그 줄에 가로로 쓴다(레인 끝 다음부터, `git log --graph --decorate`처럼). 미니맵은 오른쪽 세로 띠
- [x] 릴리스 초안 ddugit v0.3.0 (M7: 대각선 요약, 미리보기 카드, 90° 회전). 0.2.0 뒤로 Rust 변경이 없어 `all_os`는 0.2.0 때 실행으로 갈음
- 하지 않기로 한 것: 커밋 종류 기호와 변경량 밝기(2026-10-02 사용자 결정)

## M8 · 다듬기와 우주 — 2026-10-02 사용자 피드백 14가지

- [x] 로고 `ddugit`의 g 아랫부분 잘림(탑바·첫 화면): `background-clip: text`는 상자 안만 칠하므로 줄 높이와 아래 여백을 줬다
- [x] 작업 화면 위쪽(탭 → 로고·저장소·브랜치·버튼) 순서와 기능 재배치 — 결정: 한 줄 통합(맨 위 로고·탭·+·⚙, 아래 저장소 맥락 줄: 브랜치 전환기·↑↓·Fetch/Pull/Push·Commit·되돌리기 기록. 반짝임은 설정으로, 새로고침은 ⌘R)
- [x] 왼쪽 사이드바 접기, 안의 섹션(브랜치 등) 접기 — 검색 옆 버튼과 ⌘/Ctrl+B로 접으면 섹션 아이콘·개수 레일이 된다(아이콘을 누르면 그 섹션을 연 채로 펼침). 섹션 제목을 누르면 접힘(PR·stash 포함). 둘 다 설정에 저장
- [x] 사이드바에서 고른 브랜치의 활성 스타일(사용자 설명: 선택했을 때의 모양) — 그 브랜치 색의 왼쪽 빛줄·오른쪽으로 옅어지는 색조·고리 두른 별
- [x] 사이드바 브랜치 이름과 HEAD 표시 줄 맞춤
- [x] 탑바 Pull·Push·Commit 글자와 숫자 줄 맞춤(버튼을 inline-flex로)
- [x] 설정 창·오른쪽 패널(커밋 상세·커밋 작성·stash)·diff 시트·다이얼로그 배경을 검정으로(`--surface`)
- [x] 스크롤바 꾸미기(얇은 보라 손잡이, 투명 홈)
- [x] 은하계 배경을 더 실감 나게: 드물고 불규칙한 유성, 가끔 보이는 우주 요소, 행성(주기가 짧으면 정신없음)
- [x] 탭 이동 워프 연출 없애기
- [x] 저장소 하나를 행성으로: clone·열기·만들기를 행성 탄생 연출로, 새 탭 화면도 같은 은하계 배경
- [x] 커밋 미리보기 카드: 둥근 모서리 없이, 우주에서 온 신호처럼(모서리 표시, 주사선, 위에서 아래로 펼쳐짐, "수신 · sha")
- [x] 오른쪽 커밋 상세 UI/UX 고도화 — 결정: 읽기 중심(본문 전체, 한 줄 메타·sha 복사·부모로 이동, 포함한 브랜치·PR·CI, 작업 아이콘 도구줄, 디렉터리로 묶은 파일과 +/− 막대)
- [x] 커밋 메시지 표현 고도화(왼쪽 → 오른쪽 흐름 유지, 사선은 눈에 잘 안 들어옴) — 결정: 지도식 가로 라벨(별 위아래에 단을 엇갈려, 겹치면 우선순위로 숨김, 확대할수록 더 보임, 가는 지시선)

## M8+ · 우주 제어 시스템 — 2026-10-02 사용자 피드백 5가지

- [x] 사이드바 고른 브랜치의 왼쪽 빛줄(`box-shadow`) 없애기
- [x] 열린 탭의 위쪽 빛줄(`box-shadow`) 없애기 — 대신 위 두 모서리에 신호색 꺾쇠
- [x] 은하계 배경에서 먼 은하·행성 없애기(유성·혜성은 그대로)
- [x] 버튼·팝업·상단 탭의 둥근 모서리를 없애고 우주 제어 시스템처럼: 버튼은 모서리 눈금이 호버 때 신호색(시안)으로 켜지는 각진 키, 주 버튼·위험 버튼은 모서리를 깎은 키, 팝업(다이얼로그·메뉴·알림·검색·저장소 메뉴·항해 일지)은 검정 바탕에 네 모서리 꺾쇠와 희미한 주사선(`--brackets`, `--scanlines`, `--signal`). 별·점·행성처럼 원인 것만 둥글게 남김
- [x] 설정의 select 펼친 목록이 흰 바탕에 흰 글자: select와 option에 어두운 단색 배경

## M9 · 출시 준비 — 2026-10-02 사용자 요청 6가지와 결정

결정: 개인 무료 + 상업용 유료(영구 라이선스, 1년 업데이트), 결제·발급은 Lemon Squeezy, 코드 서명은 개인 이름, 로그인 없이 사용(계정 선택), 폐쇄망 대비 오프라인 라이선스. 다음 기능은 여러 저장소 은하 대시보드, 서브모듈·LFS·worktree.

- [x] 보안 점검과 보강(점검 보고서 기준)
  - [x] split commit의 파일 이름 줄바꿈 → rebase todo 명령 주입(재현됨): 경로를 NUL 구분 파일로(`--pathspec-from-file`), exec 줄에 줄바꿈 거부
  - [x] forge 토큰이 원격 URL이 정한 호스트로 새는 문제(재현됨): `gh`/`glab` 토큰은 github.com·gitlab.com 또는 사용자가 믿기로 한 호스트(`trustedForgeHosts`)에만, 그 밖의 호스트에는 토큰 창에 경고
  - [x] CSP(`default-src 'self'`, IPC만 연결, 인라인 스크립트 없음), `freezePrototype`. 실제 앱(Xvfb)에서 확인
  - [x] 충돌 해결: 충돌 중인 파일만, 저장소 안 경로만, 심볼릭 링크는 읽지도 쓰지도 않음
  - [x] git에 넘기는 ref·리비전·이름이 `-`로 시작하면 거부(`operand`)
  - [x] git 실행 파일 설정: `git`/`git.exe`라는 이름의 절대 경로만, 실행 전에 확인
  - [x] CI: 읽기 전용 토큰, 액션을 SHA로 고정, Release는 main(또는 태그)에서만
- [x] Fetch·Pull·Push 전에 확인(무엇이 오가는지 보여 주기) — pull·push는 기본으로 묻고 fetch는 읽기만 하므로 기본으로 묻지 않음(설정 '실행 전에 확인'에서 셋 다 켜고 끔). 보낼·받을 커밋 목록(`sync.ts`), 첫 push는 원격에 없는 커밋, 커밋 안 한 변경이 있으면 pull 경고, '다시 묻지 않기'
- [x] 백포트를 찾아 쓸 수 있게(보이는 진입점, 사용 안내) — 사이드바 브랜치 섹션 머리의 백포트 버튼(받는 쪽 = 현재 브랜치, 가져올 쪽 = upstream/main → origin/main → main 순으로 추정), 시트 위 4단계 안내(접으면 기억), 오른쪽 클릭 메뉴 이름을 '백포트: …'로
- [x] SSH로 clone: 키 확인·만들기, 공개키 복사, 호스트 신뢰(지문 확인), 연결 확인을 앱 안에서 — `ssh.rs`(시스템 OpenSSH, 묻지 않음: `BatchMode`, stdin 없음). clone 창의 HTTPS/SSH 전환(`sshUrl.ts`)과 'SSH 준비하기' 4단계(`SshSetup`), 인증 실패 창에도 같은 패널. 호스트 신뢰는 GitHub·GitLab이 공개한 지문과 비교하고, 보여 준 지문과 다시 받은 지문이 같을 때만 known_hosts에 추가. 키는 ed25519·암호 없음(파일 권한 600)
- [x] 오프라인 라이선스 검증(Ed25519 서명 파일, 폐쇄망은 파일로 활성화), 설정의 라이선스 화면 — `DDUGIT1.<payload>.<sig>` 텍스트, 공개키는 빌드 변수, 앱 설정 폴더에 저장, 기능 잠금 없음(신뢰 기반), `updatesUntil` 이후 버전이면 갱신 안내. 발급 스크립트 `scripts/license.mjs`(keygen·sign·verify, Node 내장 Ed25519)와 Rust 검증의 상호 확인 테스트
- [x] 서명 파이프라인 준비: macOS Developer ID + 공증, Windows 서명(시크릿이 있을 때만), 발급 서버(Lemon Squeezy 웹훅 → 서명) 설계 문서 — `release.yml`이 시크릿이 있으면 서명(macOS: APPLE_*, Windows: `WINDOWS_SIGN_COMMAND`로 Tauri `signCommand`), 빌드 날짜·공개키 주입. `docs/RELEASE.md`
- [x] 여러 저장소 은하 대시보드 → M10
- [x] 서브모듈·LFS·worktree → M10

## M10 · 여러 세계 — 2026-10-02 사용자 결정 (끝나면 v0.4.0 릴리스, 서명은 준비되는 대로 나중에)

- [x] 여러 저장소 은하 대시보드: 새 탭 화면의 최근 저장소를 행성 카드로(브랜치·upstream, 신호: 찾을 수 없음 / 멈춘 작업 / 변경 / 받을·보낼 커밋 / 보관함, 마지막 커밋), 신호별 집계, 모두 Fetch(3개씩 동시, 카드마다 결과, 설정의 fetch 확인을 따름). 백엔드 `glance.rs`(libgit2, 저장소마다 스레드, `discover`가 아닌 `open`), 순수 로직 `galaxy.ts`
- [x] worktree: 목록·추가·제거·탭으로 열기 — 스냅샷의 `worktrees`(libgit2, 연결된 worktree에서 읽어도 원본이 맨 앞), `worktree.rs`(`WorktreeOp` add/remove/prune, 변경이 남은 것은 `unmerged`로 거부 → 변경째 지우기 확인). 사이드바 Worktree 섹션(클릭 = 탭으로 열기), 추가 창(기존 브랜치 / 새 브랜치, 폴더는 `<원본 옆>/<저장소>-<브랜치>`), 브랜치 메뉴 '새 worktree에서 열기', 다른 worktree에 꺼낸 브랜치는 폴더 표시이고 체크아웃하면 그 worktree 탭을 연다
- [x] 서브모듈: 상태, init/update/sync, 탭으로 열기 — 스냅샷의 `submodules`(libgit2: 초기화 안 됨 / 최신 / 기록과 다른 커밋 / 변경 있음, 기록된·꺼낸 커밋), `submodule.rs`(`SubmoduleOp` update(`--init --recursive`, 하나 또는 전부)·sync, 인증 실패는 `auth`). 사이드바 서브모듈 섹션(클릭 = 탭으로 열기, 머리의 모두 업데이트는 맞출 게 있으면 밝게), 메뉴: 열기·업데이트·URL 복사·sync. 테스트의 git은 로컬 폴더 원격을 허용(`protocol.file.allow`, 테스트 빌드만)
- [x] LFS: 사용 여부·설치 확인, pull, track, diff에서 포인터 대신 LFS 객체로 표시 — `lfs.rs`(`git lfs version`, 루트 `.gitattributes`의 `filter=lfs` 패턴, 필터 설정 여부, `ls-files`의 `-` = 받지 않은 파일; `LfsOp` install(`--local`)·pull·track·untrack, 인증 실패는 `auth`). 스냅샷과 따로 읽음(HEAD가 바뀌거나 LFS 작업 뒤). 사이드바 LFS 섹션(git-lfs가 있거나 저장소가 쓸 때만: 설치 안내 / LFS 켜기 / 받지 않은 파일 N개 받기 / 패턴 추가·해제), diff는 포인터 대신 이전·이후 객체 크기와 oid(`lfs.ts`)
- [x] (사용자 피드백) 로컬 브랜치가 없을 때 만들 방법이 없음 — 브랜치 전환 메뉴 맨 위 '새 브랜치…'와 원격에만 있는 브랜치(고르면 추적하는 로컬 브랜치), 사이드바 브랜치 섹션은 비어도 남고 머리에 +(빈 저장소면 첫 브랜치), 원격에만 있는 브랜치 줄에 '로컬로 만들기', 같은 이름의 로컬이 다른 커밋에 있으면(`upstream/main` ↔ `main`) 조용히 그쪽으로 전환하지 않고 새 이름(`upstream-main`)을 묻는다(`CheckoutRemote.name`), 원격 브랜치 메뉴 '다른 이름으로 로컬 브랜치 만들기…'
- [x] v0.4.0 릴리스 — 버전 0.4.0(세 곳 + 잠금 파일 둘), 릴리스 전 CI · Rust all_os(macOS·Windows·Ubuntu) 통과, Release 수동 실행(서명 없음)

## M11 · 저장소 그룹과 원격 다듬기 — 2026-10-02 사용자 결정 (끝나면 v0.5.0)

결정: 저장소는 그룹 하나에만 속한다(폴더형, 없으면 미분류), 이름은 "그룹", #68 수정은 그룹 기능과 함께 v0.5.0으로 낸다.

- [x] (사용자 피드백) 원격 추가 후 받아오기까지 반응이 없음 — 추가한 원격만 받아오고(`fetch_one`, 전체 `--all` 아님), 원격 작업 동안 화면 아래 진행 카드(`JobCard`: 단계·퍼센트·막대, 0.6초 뒤에 나타나 짧은 작업은 깜박이지 않음), 끝나면 받아온 브랜치 수를 알림
- [x] (사용자 피드백) 원격이 여럿이면 원격 섹션 안에 원격별 접기(이름 앞부분 없이 브랜치, 접힘 상태 기억), 원격마다 ⋯ 메뉴(이 원격만 받아오기, URL 복사, 삭제)
- [x] 그룹 1: 데이터(순수 함수 + vitest), 대시보드 그룹 띠(집계·그룹 Fetch·모두 열기·접기·이름·색·순서), 카드 메뉴로 옮기기 — `groups.ts`(그룹 목록·색 차례·순서·`assignGroup`·`bands`), 최근 항목의 `group`(그룹에 든 것은 오래돼도 남김), 저장은 `useRecent`(`ddugit.groups`), 그룹이 없으면 예전처럼 평평한 목록
- [x] 그룹 2: 여러 장 선택, 끌어다 놓기, 자동 제안(같은 조직·같은 상위 폴더) — ⌘/Ctrl·Shift+클릭으로 고르기(고른 게 있으면 클릭도 고르기), 선택 막대(새 그룹으로·○○로·그룹에서 빼기·해제), 카드를 띠에 끌어다 놓기(고른 카드는 함께, 미분류 띠는 비어도 남아 놓을 자리), 제안은 묶이지 않은 저장소 중 같은 forge 소유자(`origin` URL, `ownerOf`) 또는 같은 상위 폴더 2개 이상이고 전부는 아닌 가장 큰 묶음, '괜찮아요'는 기억(`ddugit.groupHints`). glance에 `origin`
- [x] 그룹 3: 저장소 메뉴의 그룹 표시, 탭 위 그룹 색 줄 — 탭 ▾ 메뉴의 최근 목록을 그룹 제목 아래로(그룹마다 '모두 열기', 그다음 미분류), 그룹에 든 저장소의 탭은 위쪽 2px에 그룹 색, 툴팁에 그룹 이름
- [x] v0.5.0 릴리스 — 버전 0.5.0(세 곳 + 잠금 파일 둘), CI · Rust all_os(#72에서 macOS·Windows·Ubuntu) 통과, Release 수동 실행(서명 없음)

## M11+ · 사용자 피드백 (v0.5.0 이후)

- [x] 원격 연결 끊기: 원격이 하나뿐이어도 원격별 접기와 ⋯ 메뉴가 보이고, '연결 끊기 (원격 삭제)'
- [x] 백포트 뒤 push가 원본(upstream)으로 감: 원격 추가 시 origin이 아니면 가져오기 전용(push URL을 `DISABLED`로, `RefOp::AddRemote.fetch_only`·`SetPushable`, ⋯ 메뉴에서 보내기 허용/막기), 사이드바에 '가져오기 전용' 표시. push는 가져오기 전용 원격으로 가지 않음(백엔드에서 거부, 첫 push의 기본 원격도 건너뜀), push 확인 창에 보낼 곳(원격·URL)을 보이고 가져오기 전용이면 'origin(으)로 보내기'(`push_to`: `push -u`로 추적도 바꿈), origin이 아닌 원격으로 보내면 경고. 가져오기 전용 원격이면 확인을 꺼 둬도 창을 띄움
- [x] 체리픽 충돌을 잡았는데 충돌 파일이 없음: 가져온 커밋의 변경이 이미 있으면 git이 "now empty"로 멈춤(충돌 파일 없음) → `OpStatus::Empty`로 구분해 충돌 창 대신 '이미 들어 있는 변경' 창(건너뛰기), 진행 중 띠에 '건너뛰기'(`git <state> --skip`)와 "충돌한 파일은 없어요" 안내
- [x] 저장소를 열 때의 행성 탄생 연출 제거(`PlanetBirth`·`drawPlanet` 삭제, 탭·목록의 행성 점은 그대로)
- [x] v0.5.1 릴리스(위 수정 모두, 서명 없음)
- [x] (사용자 결정) 앱 아이콘 새 디자인: 짙은 남색 둥근 사각형에 소문자 "ddu"(굵은 둥근 선, 워드마크와 같은 시안→마젠타 그라데이션). 갈림 기호 시안은 사용자 피드백으로 버림. 원본 `design/icon.svg`, 플랫폼별 파일은 `tauri icon`으로
- [x] 사이드바 브랜치 복수 선택: ⌘/Ctrl·Shift+클릭으로 더하고 빼기, 그래프는 고른 브랜치들의 이력을 함께 밝힘, 선택 막대(N개·해제)
- [x] (v0.5.2) 브랜치 복수 선택을 단순 클릭 토글로: 누를 때마다 더하고, 이미 고른 것을 다시 누르면 그것만 빠짐(수정 키 없음)
- [x] (v0.5.2) 원격별 접기 다듬기: 구름 아이콘·원격 이름·안내선으로 잘 보이게, '받기만' 뱃지가 접기 토글 때 찌그러지지 않게(줄바꿈·축소 막음)
- [x] (v0.5.2) 은하 카드의 ⋯ 버튼: 늘 보이고(테두리), 점을 굵게
- [x] (v0.5.2) 첫 화면(은하) 진입: 탭 줄 맨 앞의 고정 '내 은하' 탭(⌘/Ctrl+0). 새 탭을 열지 않고 지금 탭 위에 보여 줌
- [x] (v0.5.2) 커밋이 없는 저장소(init + 원격 받아오기)에서 '+ 새 브랜치'가 무반응: 이름만 바뀐 빈 브랜치였음 → 원격 브랜치(origin의 main/master 우선)에서 시작. 원격도 없으면 "첫 커밋을 하면 생겨요" 안내
- [x] v0.5.2 릴리스(새 "ddu" 아이콘 #77 포함, 서명 없음)
- [x] 은하 카드의 별이 뭉개져 안 보임(⋯용 굵은 선이 별에도 걸렸음) → 별은 보통 선·늘 보이게, ⋯ 점 굵기는 아이콘 자체에서(앱 전체 ⋯). 사이드바 원격 ⋯는 테두리 버튼
- [x] (사용자 결정, 커뮤니티 플러그인 없이) 창 제목 표시줄을 탭 줄로: macOS는 신호등만 남기고 내용을 위로(`titleBarStyle: Overlay`, `tauri.macos.conf.json`), Windows는 시스템 제목 표시줄을 없애고 탭 줄 끝에 최소화·최대화·닫기(`decorations: false`, `tauri.windows.conf.json`, `WindowControls`). 탭 줄 빈 곳 끌기·더블클릭 최대화(`data-tauri-drag-region`). Windows 11 스냅 레이아웃 메뉴는 포기. Linux·데모는 시스템 제목 표시줄 그대로(`chrome.ts`)
- [x] (사용자 결정) 첫 화면 이름 '내 은하' → '내 저장소'(탭·제목·단축키 표, 영어 'Repositories')
- [x] (사용자 요청) 설정에서 우주 배경(그래프·첫 화면 뒤 성운·별, 끄면 단색)과 빛 번짐(선·커밋·[+] 글로우)을 따로 끄고 켜기
- [x] (사용자 요청 2026-10-04) M4 마무리: 닫힌·병합된 PR(#85), `--rebase-merges`

## M5 · 배포 품질

- [ ] (나중에) macOS 서명 + 공증, Windows 코드 서명 — 2026-10-01 결정: 뒤로 미룸. Apple Developer 계정, Windows 인증서가 필요하다
  - 2026-10-04: 사용자가 Apple Developer Program(1년) 가입. 인증서·시크릿 등록 대기(`docs/RELEASE.md`, Mac 없이 openssl로 만드는 법 추가)
  - 2026-10-04 결정: 오픈소스 아님, 저장소 비공개. 배포는 GitHub Release가 아니라 별도 사이트·파일 저장소(dmg·exe). Release 초안은 내부 보관용(`docs/RELEASE.md` 배포 위치)
  - [x] macOS 서명·공증(2026-10-04): Secrets 6개, 서명 테스트 빌드에서 공증 Accepted·스테이플, 빌드 뒤 dmg 안 앱을 codesign·spctl·stapler로 확인. `.p12`는 빌드 전에 OpenSSL로 열어 틀린 Secret을 알려 주고 macOS `security`가 읽는 형식(SHA-1 MAC·3DES)으로 다시 묶는다
- [ ] (나중에) 자동 업데이트 (tauri-plugin-updater) — 2026-10-01 결정: 뒤로 미룸. 서명과 배포 위치를 정한 뒤에 한다(배포는 별도 사이트로 결정, 사이트 주소가 정해지면)
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
- [x] 고급 git 작업을 간편 기능으로
  - [x] 실수 되돌리기: 마지막 커밋 취소, 이 커밋으로 되돌리기(soft/mixed/hard), reflog로 잃어버린 커밋·지운 브랜치 복구 — 커밋 우클릭, 탑바 ⏱ 되돌리기 기록, 되돌릴 때 시간을 감는 연출
  - [x] 브랜치 정리: 병합 끝난 로컬 브랜치 일괄 삭제, 원격에서 사라진 브랜치 정리(prune), 오래된 브랜치 목록 — 사이드바 "브랜치" 옆 ✧, 지운 브랜치 끝이 별가루로 흩어짐
  - [x] 과거 커밋 손보기: 메시지 고치기(reword), 작성자 바꾸기, 커밋 둘로 나누기, 파일 하나만 특정 커밋 상태로 — 커밋 우클릭, 변경 파일 우클릭, 손본 커밋에 노바(빛의 고리) 연출
  - [x] 추적·조사: 그래프에서 bisect(좋음/나쁨 클릭), 파일 이력·blame
    - [x] bisect: 커밋 우클릭으로 범위 고르기, 배너에서 버그 있음/없음/건너뛰기, 후보 밖은 흐리게, 지금 확인할 커밋에 망원경 조준선, 범인에 붉은 노바
    - [x] 파일 이력·blame: 변경 파일 우클릭 → 그 파일을 바꾼 커밋을 금빛 별자리로 잇고(이름 바뀜 추적, 혜성이 옛것→최근으로 흐름) 나머지는 흐리게, 배너에서 더 최근/더 예전으로 이동. blame 시트는 줄 묶음마다 별 색(붉을수록 오래됨, 푸를수록 최근), 누르면 그 커밋으로
- [x] 게임 같은 우주 연출 (기능마다, 반짝임 효과를 끄면 정적으로)
  - [x] 원격: push는 HEAD에서 쏘아 올리는 궤적과 혜성, pull·fetch는 새로 들어온 커밋마다 떨어지는 유성과 충돌 섬광 (진행률은 탑바 버튼에 그대로 둔다: 조작 요소는 차분하게). 연출은 `components/Fx.tsx`의 효과 큐 하나로 모았다
  - [x] 그래프 작업: 끌어서 유효한 대상 위에 오면 중력장(돌며 빨려드는 점선 고리, 병합·cherry-pick·순서 옮기기 공통), 병합은 두 별이 합쳐지는 섬광과 충격파, cherry-pick은 원본에서 새 커밋으로 혜성, rebase는 다시 쌓인 커밋을 별자리로 잇고 하나씩 반짝임. 위치는 카메라가 멈춘 뒤(rAF 세 프레임 같을 때) 읽는다
  - [x] 충돌은 붉은 성운 경고(충돌 파일이 있는 동안 그래프 위에 천천히 흐름), 마지막 파일을 해결하면 흩어지며 걷힘 · 되돌리기(reset/reflog)는 시간을 감는 효과 · 탭 전환은 워프
  - 원칙: 조작 요소는 지금처럼 차분하게(가독성), 연출은 그래프 캔버스와 결과 순간에만. `prefers-reduced-motion`과 반짝임 설정을 따른다

---

## 출시까지 — 2026-10-04 사용자 결정

결정:

- Windows는 서명 없이 배포한다(다운로드 페이지에 SmartScreen 안내).
- 다운로드 사이트는 직접 만든다: 저장소 `ddugit-site`, 도메인 `ddugit.com`, 호스팅 Netlify, 로그인은 GitHub·Google(Supabase Auth), Supabase 연동.
- 다운로드와 앱 사용에는 로그인이 필요 없다. 로그인은 구매·라이선스 관리에만 쓴다.
- 가격은 구독제 월 4,900원 + 연 49,000원(Lemon Squeezy, 월 결제는 수수료 5%+$0.50 비중이 커서 연 결제를 함께 둔다). 사업자등록·통신판매업 등 세무는 사용자가 확인한다.
- ~~설치 파일 저장소는 Cloudflare R2(트래픽 요금 없음)를 쓴다. `dl.ddugit.com` 연결을 위해 ddugit.com DNS를 Cloudflare로 옮긴다(사이트는 Netlify 그대로).~~ → 같은 날 변경: Cloudflare까지 관리하지 않고 **Supabase Storage**(공개 버킷 `releases`, S3 API로 업로드)를 쓴다. 무료 플랜은 다운로드 트래픽이 제한되니 늘면 Pro로. 저장소를 바꿔도 사이트는 `downloads.json` 주소만 바꾸면 된다

### M12 · v0.6.0 정리 릴리스

- [ ] 버전 0.6.0, CI · Rust all_os, Release(서명된 macOS + 미서명 Windows)
- [ ] 실제 기기 점검(사용자): macOS 서명 경고 없음·신호등 위치·창 끌기·더블클릭 최대화, Windows 창 버튼·가장자리 크기 조절·SmartScreen 흐름

### M13 · 배포 인프라 (Supabase Storage + 자동 업데이트)

- [ ] Supabase Storage 버킷 `releases`(공개). 사용자: S3 접근 키 → Secrets, 프로젝트 ref·리전 → Variables (`docs/RELEASE.md`)
- [x] `release.yml`이 릴리스 때 dmg·exe를 `releases/v<버전>/`에, 다운로드 페이지용 `downloads.json`을 버킷 맨 위에 올림(`scripts/downloads.mjs`). ~~GitHub Release 초안은 내부 보관용~~ → GitHub Release는 만들지 않고 artifact로만 남긴다(2026-10-04, 초안 만들기 403 뒤 사용자 결정)
- [ ] 업데이트 정보(`latest.json`)와 업데이트 파일(서명 포함)도 같은 버킷에
- [ ] 앱 자동 업데이트(`tauri-plugin-updater`): 시작할 때 확인, 알림, 설치 후 재시작. 업데이트 서명 키는 사용자가 만든다(개인키는 Secrets에만)

### M14 · 다운로드 사이트 `ddugit-site`

- [x] Netlify에 올라가는 사이트 골격(첫 화면·다운로드·변경 내역·가격·약관·개인정보처리방침) — ddugit-site#1
- [x] 다운로드: OS 자동 감지, 최신 버전은 ~~R2의 `latest.json`~~ Supabase의 `downloads.json`(`NEXT_PUBLIC_DOWNLOADS_URL`), Windows SmartScreen 넘기는 법 안내 — ddugit-site#1
- [ ] Supabase Auth(GitHub·Google), 로그인 후 '내 계정'(구독·라이선스)

### M15 · 구독과 라이선스

- [ ] 라이선스 형식을 구독에 맞게: 만료일(결제 기간 끝 + 유예 7일). 앱은 로그인 없이 라이선스 키로 `ddugit.com`에서 갱신받는다(구독이 살아 있으면 새 만료일). 폐쇄망은 연 단위 사이트 라이선스를 수동 발급. 구독이 끝나면 기능은 막지 않고 갱신 안내만(신뢰 기반, 사용자 확인 필요)
- [ ] Lemon Squeezy 상품(월·연 구독, 사이트 라이선스), 결제 웹훅 → Supabase Edge Function이 서명·저장·메일 발송
- [ ] 앱 구매 버튼(`BUY_URL`)을 사이트 가격 페이지로, 결제부터 앱 활성화까지 끝까지 확인

### M16 · v1.0 출시

- [ ] 첫 실행 안내·영문 문구 점검, 큰 저장소 성능 확인, 문제 신고 경로
- [ ] v1.0.0 출시
- [ ] (출시 뒤) Windows 서명(Microsoft Store 또는 Certum)

---

## 작업 기록 (append-only)

| 날짜       | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | M0 완료: 골격, git 백엔드(테스트 6), 레이아웃(테스트 8), 네온 렌더러, ＋ 커밋, 끌어서 병합, 미니맵                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-01 | 워크플로우 도입: CLAUDE.md / CONVENTIONS.md / ROADMAP / NEXT, CI(ubuntu·macos·windows), Prettier·rustfmt                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-01 | M1: fetch/pull/push(+ahead/behind, 갈라짐·거부 처리), diff 시트(커밋/작업 트리), git 모듈 분리(테스트 17)                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-01 | `main` 생성(골격 커밋), 첫 PR #1. M1 완료: 원격 진행률(`--progress` → Tauri Channel), 인증 실패 분류 + OS별 안내 다이얼로그(테스트 20)                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-01 | M2: discard(확인 필수) + stash push/apply/pop/drop, 그래프 스태시 마커·패널·사이드바, ChangedFiles/format 공통화(테스트 25)                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-01 | PR #1 squash merge(`e588fba`). M2: cherry-pick/revert(`git/pick.rs`)/amend, 노드 우클릭 메뉴, ⌥ 드래그 cherry-pick, 배너 계속/취소 일반화(테스트 29)                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-01 | PR #2 squash merge(`a0bff0b`). M2: 브랜치·태그 관리(`git/refs.rs`, `RefOp` 표 하나), 배지/사이드바 우클릭 메뉴, `NameDialog` 일반화(테스트 33)                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-01 | PR #3 squash merge(`0db48ef`). M2: 커밋 검색(`graph/search.ts` + vitest 5, `SearchBar`, 일치 항목만 밝게 표시). PR 운영: GitGuardian 때문에 완료 이벤트가 오지 않아 10분 뒤 확인 예약으로 전환                                                                                                                                                                                                                                                                                                     |
| 2026-10-01 | PR #4 squash merge(`021d5c5`). M2: hunk 스테이징(`git/stage.rs`: 패치에서 hunk 골라 `git apply --cached`), `DiffScope`(all/unstaged/staged), `commit_index`(테스트 37)                                                                                                                                                                                                                                                                                                                             |
| 2026-10-01 | PR #5 squash merge(`3c20d93`). M2: 충돌 해결(`git/conflict.rs`, `src/conflict.ts` 마커 파서 + vitest 6, `ConflictSheet`, 충돌이 나면 자동으로 열림)(테스트 40)                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-01 | PR #6 squash merge(`6f8978a`, Windows CRLF 테스트 수정 포함). 그래프에 진행 중 병합 표시(`incoming`, MERGE/CHERRY_PICK/REVERT_HEAD), 알림 위치를 아래로(테스트 41)                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-01 | PR #7 squash merge(`fed643f`). M3: 이전 이력 더 불러오기(그래프 꼬리 버튼, `limit` 상태, 레이아웃이 바뀌어도 최신 커밋 기준으로 카메라 고정, 불러온 이력에는 반짝임 효과 없음)                                                                                                                                                                                                                                                                                                                     |
| 2026-10-01 | PR #8 squash merge(`fd705ac`). M3: 파일 감시(`git/watch.rs`, notify-debouncer-mini, `repo-changed` 이벤트), 실제 앱에서 터미널 커밋이 바로 반영되는 것 확인(테스트 43)                                                                                                                                                                                                                                                                                                                             |
| 2026-10-01 | PR #9 squash merge(`f440e4b`). M3: 라벨 겹침 회피(`graph/labels.ts` `placeBadges`: HEAD 우선, 겹치면 위로 올리고 연결선, 그래도 안 되면 "+N" 칩)(vitest 24)                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-01 | PR #10 squash merge(`3f4e8f7`). M2 마무리: 줄 단위 스테이징(`select_lines`: 고르지 않은 `-`는 문맥으로, `+`는 버림, 내리기는 반대), 충돌 블록 직접 편집(줄바꿈 보존), 알림을 그래프 영역 안으로(테스트 47, vitest 25)                                                                                                                                                                                                                                                                              |
| 2026-10-01 | PR #11 squash merge(`d3461b1`). M3: 일직선 구간 접기(`graph/runs.ts` `straightRuns`, ref·HEAD·stash·병합 대기 커밋은 접지 않음, 검색 중이거나 선택된 구간은 펼친 채로), 데모 `__otgitDemo.grow(n)`(vitest 28)                                                                                                                                                                                                                                                                                      |
| 2026-10-01 | PR #12 squash merge(`0dea355`). 성능 항목은 측정 후 보류(수치는 M3에 기록). M5: Playwright e2e(`e2e/`, `npm run e2e`, CI 잡 추가, 반복 60회 안정), 데모 `__otgitDemo.snapshot()`                                                                                                                                                                                                                                                                                                                   |
| 2026-10-01 | PR #13 squash merge(`1de7c77`). e2e가 첫 CI에서 실제 버그를 잡았다(최신 Chromium `scrollTo`가 Promise를 돌려줘서 diff 시트가 깨짐, effect 식 본문 → 블록). M5: ESLint 추가, 같은 실수를 막는 규칙                                                                                                                                                                                                                                                                                                  |
| 2026-10-01 | PR #14 squash merge(`4b08f67`). M4: 백포트 트래커(`git/backport.rs`: `--cherry-mark`로 같은 패치, `-x` 트레일러로 고쳐서 옮긴 것까지 인식, 제외는 `otgit.backportIgnored` 로컬 config, 일괄 cherry-pick -x, `format-patch` 내보내기, `BackportSheet`)(테스트 50, e2e 6)                                                                                                                                                                                                                            |
| 2026-10-01 | PR #15 squash merge(`91920f1`). 원격 추가·삭제(`RefOp::AddRemote/RemoveRemote`, 사이드바 ＋, `NameDialog` 두 번째 칸 일반화, 백포트 시트 안내를 버튼으로)(테스트 51, e2e 7)                                                                                                                                                                                                                                                                                                                        |
| 2026-10-01 | PR #16 squash merge(`fac2a73`). M4: interactive rebase(`git/rebase.rs`: 미리 쓴 todo를 `sequence.editor=cp`로 넣음, 빠진 커밋·맨 앞 squash 거부, 충돌은 기존 흐름; `rebasePlan.ts` + vitest 4; `RebaseSheet`)(테스트 54, e2e 8)                                                                                                                                                                                                                                                                    |
| 2026-10-01 | PR #17 squash merge(`5a95888`). 강제 push(`RemoteOp::ForcePush` = `push --force-with-lease`, 거부 화면 세 번째 선택, 그사이 남이 올린 커밋은 lease가 막는 것을 bare 저장소로 테스트)(테스트 55, e2e 9)                                                                                                                                                                                                                                                                                             |
| 2026-10-01 | PR #18 squash merge(`d6bf590`). M5: react-hooks 권장 규칙 전부 켬. effect 안 setState 9곳 → 렌더 중 조정(경로·초기 파일·부분 스테이지), 데이터를 키와 함께 저장(패널 파일·충돌 파일·줄 선택), diff 다시 불러오기를 fetch만 하도록 분리, 첫 로드에 늦게 온 응답 무시                                                                                                                                                                                                                                |
| 2026-10-01 | PR #19 squash merge(`74f7924`). 백포트: 제외를 받는 쪽별 config(`otgit.<target>.backportIgnored`, 예전 저장소 전체 키도 읽음), `backport_summary` + "대상별" 탭(테스트 56, e2e 10)                                                                                                                                                                                                                                                                                                                 |
| 2026-10-01 | PR #20 squash merge(`1d0ac4e`). M5: 설정 화면(`settings.ts` 파싱 + vitest 3, `SettingsDialog`, `git::set_program` 전역 git 경로를 검증 후 적용, 예전 `otgit.animate` 키 이어받음)(테스트 57, e2e 11)                                                                                                                                                                                                                                                                                               |
| 2026-10-01 | PR #21 squash merge(`62759c0`). M5: 키보드로 커밋 이동(`graph/navigate.ts` `stepFrom` + vitest 2, 화면 밖이면 배율 유지하며 따라감, 입력·목록에 포커스가 있을 땐 화살표를 가로채지 않음), 스크린리더 안내(e2e 12)                                                                                                                                                                                                                                                                                  |
| 2026-10-01 | PR #22 squash merge(`2aa0abf`). M4: Shift+끌기로 커밋 순서 옮기기(`planMove` + vitest 3, 드래그 모드 `move`, 확인은 기존 RebaseSheet에서)(e2e 13)                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-01 | PR #24 squash merge(`d284a40`). 사용자 결정: 밝은 테마 없음, 은하계 스타일, 영어 번역 필요, 서명·자동 업데이트는 나중에, 배포는 dmg/exe. 은하계 스타일(`graph/space.ts`, UI 토큰 `--glass*`/`--ui*`, 조작 요소의 네온·발광 제거, CONVENTIONS에 규칙)                                                                                                                                                                                                                                               |
| 2026-10-01 | PR #25 squash merge(`d2a5ccf`). 배포: `bundle.targets = [dmg, nsis]`(macOS 11+, universal / Windows 사용자 설치, 한·영 설치 화면), `release.yml`(태그 → 초안 Release, 수동 실행 → artifact), 옷깃 아이콘(은하계 + 네온 브랜치 그래프, `tauri icon`으로 전 크기 생성)                                                                                                                                                                                                                               |
| 2026-10-01 | PR #26 squash merge(`f7363d7`). i18n 기반: `src/i18n`(`ko.ts` 원본, `en.ts`, `t()`, `<Rich>`), 설정에 언어(시스템/한국어/English, `<html lang>`), 탑바·사이드바·검색·다이얼로그·설정·단축키 표·그래프 글자 번역, Playwright는 `ko-KR` 고정 + 영어 전환 e2e(vitest 42, e2e 14)                                                                                                                                                                                                                      |
| 2026-10-01 | PR #27 squash merge(`c46fd83`). i18n B: App의 알림·메뉴·확인 문구, 진행 중 배너(`stateText`), Inspector·Composer·StashPanel 번역(e2e 14)                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-01 | i18n C: Backport·Conflict·Diff·Rebase 시트, Auth·Sync 다이얼로그, `rebasePlan` 사유·동작 이름 번역. `<Rich bold>`로 `<b>`에 클래스. 이제 `src/` 화면 문구는 모두 사전에 있다(e2e 14)                                                                                                                                                                                                                                                                                                               |
| 2026-10-01 | PR #28 squash merge(`78ed8a8`). v0.1.0: 태그 push가 세션 환경에서 막혀서 Release 수동 실행에 `release` 옵션 추가(`v__VERSION__` 초안, 공개 시 태그 생성)                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-01 | PR #29 squash merge(`080b09d`). M6 계획(사용자 요청: 무한맵, 멀티탭, 연결 방법, 고급 작업, 하늘 회전, 브랜드, 게임 같은 연출). 우주 다듬기: `clampView`(+vitest 3), `skyAngle`(+vitest 1), "옷깃" 삭제                                                                                                                                                                                                                                                                                             |
| 2026-10-01 | PR #30 squash merge(`034e64b`). M6 연결: `git/setup.rs`(clone·init·repo_root + 테스트 4), `recent.ts`(+vitest 3), `Connect.tsx`(저장소 메뉴·첫 화면·clone 창, 인증 실패 시 `AuthDialog`에 `git clone` 안내), 끌어다 놓기(Tauri 드래그 이벤트, 저장소가 아니면 init 제안). 저장소를 바꿀 때 ResizeObserver가 사라진 캔버스를 건드리던 오류 수정(e2e 16)                                                                                                                                             |
| 2026-10-01 | PR #31 squash merge(`b7620a3`). M6 멀티탭: App을 탭 셸(`App`)과 저장소 화면(`RepoView`)으로 나눔, `tabs.ts`(+vitest 4), `TabBar`, 숨은 탭은 그리지 않고(캔버스 0×0) 돌아와도 카메라 유지, 탭 전환 워프(반짝임 효과가 켜졌을 때), 알림은 창 하나에서(e2e 17)                                                                                                                                                                                                                                        |
| 2026-10-01 | PR #32 squash merge(`cfe8e36`). M6 실수 되돌리기: `git/undo.rs`(reset·reflog + 테스트 4), `components/Undo.tsx`(되돌리기 창: 모드별 결과·push·버릴 변경 경고, 되돌리기 기록 시트: 잃어버린 커밋 표시·브랜치로 살리기·여기로 되돌리기), 데모 reflog(명령마다 HEAD 이동 기록), 되감기 연출(그래프 영역 안, `.fx-clip`)(e2e 18)                                                                                                                                                                       |
| 2026-10-01 | PR #33 squash merge(`96a6026`). M6 브랜치 정리: `git/cleanup.rs`(report·delete_branches + 테스트 2: 병합/gone 판정은 로컬 bare 원격에서 다른 클론이 브랜치를 지우는 상황으로), `CleanupSheet`(병합 완료는 기본 선택, gone, 90일 넘은 오래된 브랜치, 병합 안 된 게 섞이면 확인), `GraphHandle.screenOf`로 지운 끝 자리에 별가루(e2e 19)                                                                                                                                                             |
| 2026-10-01 | PR #34 squash merge(`a874e36`). M6 과거 커밋 손보기: `git/edit.rs`(`CommitEdit` reword/author/split + `restore_file`, 테스트 7: 뿌리 커밋, 따옴표·공백 경로, autostash, 가지 밖 거부, UI JSON 모양), `EditCommitDialog`, Inspector 변경 파일 우클릭(이 커밋 상태로 / 이전 상태로), 노바 연출(e2e 20)                                                                                                                                                                                               |
| 2026-10-01 | PR #35 squash merge(`59571df`). M6 bisect: `git/bisect.rs`(+테스트 2: 9개 중 범인 찾기, 건너뛰기), 그래프 `NodeBadge`(good/bad 고리, probe 조준선, culprit 맥박), 전용 배너, 후보 밖 흐리게(focus), 데모 bisect(HEAD는 그대로, 상태로만)(e2e 21)                                                                                                                                                                                                                                                   |
| 2026-10-01 | PR #36 squash merge(`d995819`). M6 파일 이력·blame: `git/history.rs`(+테스트 2: 이름 바뀜 따라가기, 줄마다 커밋), 그래프 `trail`(금빛 별자리·혜성), 이력 배너, `BlameSheet`(별 온도 색), CI e2e 단계 timeout(e2e 22)                                                                                                                                                                                                                                                                               |
| 2026-10-01 | PR #37 squash merge(`aff5c4d`). bisect e2e를 메뉴 제목 확인 후 재시도로 안정화(`commitMenu`). M6 원격 연출: `components/Fx.tsx`(`useFx` 효과 큐 + `FxLayer`, 노바·별가루·되감기도 옮김), push 궤적·혜성(`offset-path`), fetch·pull 유성(작업 전후 스냅샷 비교, `latest` ref)(e2e 23)                                                                                                                                                                                                               |
| 2026-10-01 | PR #38 squash merge(`aedb7fc`). 연출 2단계 그래프 작업: renderer `drawGravityWell`, `Fx` fusion·comet·constellation, `playAfterDraw`(rAF로 카메라가 멈출 때까지 기다림, `run()`이 끝난 뒤 새 스냅샷 기준), CI Linux deps 단계 timeout(e2e 24)                                                                                                                                                                                                                                                      |
| 2026-10-01 | PR #39 squash merge(`10ce8c6`). 연출 3단계 충돌: `Nebula`(충돌 파일 수 > 0이면 `.on`, 해결되면 transition으로 흩어짐, 반짝임을 끄면 움직임 없이 색만), 충돌 e2e에 성운이 끼고 걷히는 것 확인. 게임 같은 연출 완료(e2e 24)                                                                                                                                                                                                                                                                          |
| 2026-10-02 | PR #40 squash merge(`5c118dc`). 이름 변경 otgit → ddugit(저장소 `Jimoou/ddugit`, 앱 identifier `com.ddugit.app`, 크레이트·패키지·화면·문서). 백포트 제외 config는 예전 `otgit.*` 키도 계속 읽는다. CI 절감: PR에서만, 바뀐 쪽만(`ci-web.yml`/`ci-rust.yml` 경로 필터), Rust는 ubuntu만(macOS·Windows는 수동 `all_os`), main push 검사 없음. 사용자가 저장소를 public으로 바꿨다                                                                                                                    |
| 2026-10-02 | PR #41 squash merge(`0bc7ca2`). M4 PR 연동: `forge.rs`(원격 URL → GitHub/GitLab, 토큰 gh/glab → keyring, ureq로 열린 PR·MR, 테스트 4: URL·API 주소·로컬 서버로 응답·401), `components/Pulls.tsx`(`prRefs` 가짜 `pr` ref로 그래프 라벨, 사이드바 섹션, 토큰 창), `open_url`(https만), 5분마다·원격 작업 후 다시 읽기(e2e 25)                                                                                                                                                                        |
| 2026-10-02 | PR #42 squash merge(`95b6fff`). PR 상태: `forge.rs`를 GraphQL로 바꿈(GitHub `statusCheckRollup`·`reviewDecision`, GitLab `headPipeline`·`approved`, GraphQL 오류도 실패로), `Checks`/`Review`, 라벨 색·표시, 사이드바 점·칩(cargo test forge 5, vitest 61)                                                                                                                                                                                                                                         |
| 2026-10-02 | PR #43 squash merge(`d38c81e`). M7 계획(사용자 결정: 튜토리얼, ddugit 릴리스, SVG 아이콘, 대각선 요약, 미리보기 카드, 90° 회전). 튜토리얼: `missions.ts`(순수, vitest 2), `components/Missions.tsx`(`useVoyage`, `MissionPanel`), RepoView 작업 지점마다 `tour.mission`, 탑바 데모 표시로 다시 열기, e2e는 기본으로 닫아 둠(e2e 26)                                                                                                                                                                |
| 2026-10-02 | PR #44 squash merge(`6103882`). 자체 SVG 아이콘: `icons.ts`(24×24 stroke path 표, `iconPath` Path2D 캐시), `Icon` 컴포넌트, 탑바·사이드바·시트 닫기·HUD·연결·검색·튜토리얼, 캔버스 라벨 아이콘(`drawIcon`), PR 리뷰 표시는 `RefInfo.review`로 옮김(e2e 26)                                                                                                                                                                                                                                         |
| 2026-10-02 | PR #45 squash merge(`93cc711`). 릴리스 준비: 버전 0.2.0(세 곳 + 잠금 파일). main에서 "CI · Rust" `all_os` 수동 실행(macOS·Windows에서 keyring·opener 첫 빌드 확인)                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-02 | PR #46 squash merge(`80b2a07`), Release workflow 수동 실행(v0.2.0 초안). 대각선 요약: `graph/captions.ts`(`captionLength`: 아래·위 방향, 별 충돌, 평행 요약 겹침, 위쪽은 왼쪽 위 커밋의 요약과 교차 방지, vitest 5), renderer `drawCaption`(어두운 테두리, 배지 아래에 그림), `ZOOM.captions` 0.6                                                                                                                                                                                                  |
| 2026-10-02 | PR #47 squash merge(`f3e250b`). 미리보기 카드: GraphCanvas `onHover`(바뀔 때만, 누르기·휠·떠나기에 null), `components/Peek.tsx`(`bodyPreview` vitest 1, 파일은 `api.commitDiff` 캐시), RepoView `PEEK_DELAY_MS` 타이머(e2e 27)                                                                                                                                                                                                                                                                     |
| 2026-10-02 | PR #48 squash merge(`68fdf86`). v0.2.0 초안 완성(Release run 36950748275). 90° 회전: `View.r`(`turn`, `toScreen`/`toWorld`/`viewAt`), 캔버스 변환에 회전 행렬, `camera.turnBounds`로 clamp·fit, 휠은 시간 축을 따라(세로면 목록처럼), 화살표는 화면 방향을 그래프 방향으로 되돌려 해석, 접힌 구간·케이블·미니맵 회전, 180°는 대각선 요약의 행·레인 방향을 뒤집음(`flip`), 세로는 `laneReach` + `inlineBadges`로 한 줄 요약, 숨은 탭은 그래프 단축키를 받지 않음(vitest 71, e2e 28)                 |
| 2026-10-02 | PR #49 squash merge(`2db4166`). 사용자 결정: v0.3.0 릴리스 먼저. 버전 0.3.0(세 곳 + 잠금 파일 둘)                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-02 | PR #50 squash merge(`cf276f6`), Release 수동 실행(v0.3.0 초안). M8 계획(사용자 피드백 14가지). 다듬기: 로고 잘림, HEAD 줄, 탑바 숫자 줄, 패널·다이얼로그 검정, 스크롤바, 워프 제거, 미리보기 카드 신호 스타일                                                                                                                                                                                                                                                                                      |
| 2026-10-02 | PR #51 squash merge(`6227276`). 사용자 결정: 상단 한 줄 통합, 커밋 상세 읽기 중심, 지도식 가로 라벨, 4번은 고른 브랜치의 활성 스타일. 사이드바 접기(레일, ⌘/Ctrl+B)·섹션 접기(`SideSection`, 설정 `sidebarCollapsed`·`closedSections`), 고른 브랜치를 그 색으로. RepoView 설정 콜백을 `onChangeSettings` 하나로(e2e 29)                                                                                                                                                                            |
| 2026-10-02 | PR #52 squash merge(`3093782`). 상단 재배치: 맨 위 줄 `TabBar`(로고·탭·저장소 메뉴 ▾·+·⚙, 탭 이름은 스냅샷의 저장소 이름), 아래 `TopBar`는 저장소 맥락(브랜치 전환기 메뉴·upstream·데모·Fetch/Pull/Push·Commit·되돌리기 기록). 반짝임 토글은 설정으로, 새로고침 버튼 대신 ⌘/Ctrl+R·F5(e2e 30)                                                                                                                                                                                                      |
| 2026-10-02 | PR #53 squash merge(`7b9368c`). 지도식 가로 라벨: `captions.ts` `placeCaptions`(중요도 순 탐욕 배치: 별 바로 아래 → 위(배지 없을 때) → 한 단 아래·위 → 두 단 아래, 긴 것은 120px로 줄여 한 번 더, 지시선이 다른 라벨·별을 지나지 않게, 자리가 없으면 숨김), 장애물은 별·배지·[+]·stash. 사선 `captionLength`·`SLANT` 삭제(vitest 72)                                                                                                                                                               |
| 2026-10-02 | PR #54 squash merge(`1a8d61f`). 커밋 상세 읽기 중심: 제목·본문 → 머리글자·작성자·상대 시간(`fmtAgo`, 절대 시각은 툴팁) → sha 복사·부모로 이동 → 참조(PR은 CI 점)·포함한 브랜치 → 도구줄(커밋 메뉴에서 `icon` 있는 항목 + 더 보기 = 전체 메뉴) → 폴더로 묶은 파일(`byFolder`, +/− 막대, 합계). 체크아웃 버튼 목록과 새 브랜치 입력은 도구줄로. 조상 캐시는 렌더 중 ref 읽기 대신 `ancestorsOf`(커밋 목록별 WeakMap)(vitest 74)                                                                      |
| 2026-10-02 | PR #55 squash merge(`a341512`). 은하계 실감: 먼 행성 둘(고리 행성 하나)·나선 은하(먼지 팔, 하늘과 함께 회전), 드문 유성(7–25초 불규칙, 반짝임 켤 때만), 혜성(2–4분에 한 번, 20초 넘게 천천히). 저장소 = 행성: `planet.ts`(경로로 색·고리·띠, `drawPlanet`), 탭·최근 목록의 `PlanetDot`, 새 탭 화면은 같은 은하(`SpaceBackdrop`), 사용자가 열기·가져오기·만들기를 하면 `PlanetBirth`(먼지 → 점화 섬광 → 행성, 1.9초, 클릭을 막지 않음, 이미 열린 저장소로 옮길 때는 없음). M8 끝(vitest 75, e2e 30) |
| 2026-10-02 | PR #56 squash merge(`429b37c`), M8 끝. M8+ 우주 제어 시스템 스타일(사용자 피드백 5가지): 둥근 모서리 제거(원 제외), 버튼 모서리 눈금, 주 버튼 깎은 모서리, 팝업 꺾쇠·주사선, 탭·사이드바 빛줄 제거, 하늘의 먼 은하·행성 제거, select 목록 색                                                                                                                                                                                                                                                       |
| 2026-10-02 | PR #57 squash merge(`0f93552`). M9 계획(사용자 결정). 보안 점검(서브에이전트, 읽기 전용) 후 보강: split 주입, forge 토큰 호스트, CSP, 충돌 경로·심볼릭 링크, `operand`, git 경로, CI 권한·SHA 고정(cargo test 88)                                                                                                                                                                                                                                                                                  |
| 2026-10-02 | PR #58 squash merge(`2d07b5e`). 원격 작업 확인: `sync.ts`(`syncPlan`, `between`, vitest 2), `SyncConfirm`, 설정 `confirmRemote`(e2e 31)                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-02 | PR #59 squash merge(`43ca6c9`). 백포트 진입점·안내(`openBackport`, `BackportGuide`, 아이콘 `backport`)(e2e 32)                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-02 | PR #60 squash merge(`fc22eb1`). SSH: `ssh.rs`(cargo test 5: 주소에서 호스트, 지문·공개 지문 비교, 인사말에서 계정, 키 만들기·권한, 실제 키 지문), `sshUrl.ts`(vitest 2), `SshSetup`(e2e 1). 샌드박스는 22번 포트가 막혀 실제 서버 확인·연결은 데스크톱에서 확인 필요                                                                                                                                                                                                                               |
| 2026-10-02 | PR #61 squash merge(`100d6ef`). 라이선스(`license.rs` cargo test 5, Node 발급 스크립트와 상호 확인), 설정의 라이선스 화면(e2e 34), `release.yml` 조건부 서명·빌드 정보, `docs/RELEASE.md`                                                                                                                                                                                                                                                                                                          |
| 2026-10-02 | PR #62 squash merge(`d457252`), M9 끝. M10 계획(사용자 결정: 은하 대시보드, 서브모듈·LFS·worktree, 그다음 v0.4.0. 서명은 준비되는 대로)                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-02 | PR #63 squash merge(`3378170`). 은하 대시보드: `glance.rs`(cargo test 2), `galaxy.ts`(vitest 2), `Galaxy.tsx`, 모두 Fetch(e2e 35)                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-02 | PR #64 squash merge(`a94753b`). worktree: `worktree.rs`(cargo test 2), 스냅샷 `worktrees`, `Worktrees.tsx`(사이드바 섹션·추가 창), 다른 worktree의 브랜치 체크아웃 = 그 탭 열기(e2e 36)                                                                                                                                                                                                                                                                                                            |
| 2026-10-02 | PR #65 squash merge(`48e0de7`). 서브모듈: `submodule.rs`(cargo test 1), 스냅샷 `submodules`, `Submodules.tsx`, 데모 서브모듈 둘(e2e 37)                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-02 | PR #66 squash merge(`68f2b3d`), M10 기능 끝. LFS: `lfs.rs`(cargo test 2, git-lfs 없으면 건너뜀), `lfs.ts`(vitest 3), `Lfs.tsx`(사이드바·포인터 diff)(e2e 38). CI · Rust all_os(run 36967335404) 통과                                                                                                                                                                                                                                                                                               |
| 2026-10-02 | PR #67 squash merge(`ae902cd`), Release 수동 실행(run 36968247315) → `ddugit v0.4.0` 초안. M10 끝                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-02 | 사용자 피드백: 로컬 브랜치 만들기 진입점(브랜치 전환 메뉴·사이드바 +·원격 전용 표시, 이름이 겹치면 새 이름, 빈 저장소의 첫 브랜치)(cargo test 106, e2e 39)                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-02 | PR #68 squash merge(`5eb2d37`). M11 계획(사용자 결정: 그룹은 폴더형, 이름 "그룹", v0.5.0에 함께). 원격 다듬기: `fetch_one`(cargo test 1), `JobCard`, 원격별 접기                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-02 | PR #69 squash merge(`8e78e7c`). 그룹 1: `groups.ts`(vitest 4), `Galaxy.tsx` 그룹 띠·카드 ⋯ 메뉴, 모두 열기(`openIn`을 차례로)(e2e 40)                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-02 | PR #70 squash merge(`9d4406c`). 그룹 2: `suggestGroup`·`ownerOf`(vitest 2), glance `origin`, 선택 막대·끌어다 놓기·제안(e2e 41)                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-02 | PR #71 squash merge(`d477ee4`). 그룹 3: 저장소 메뉴의 그룹 제목·모두 열기, 탭 그룹 색 줄(e2e 42)                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-02 | PR #72 squash merge(`7277d66`), M11 끝. 그룹 3(저장소 메뉴·탭 색 줄, e2e 42). v0.5.0 버전 올림                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-02 | PR #73 squash merge(`ba88760`), Release → `ddugit v0.5.0` 초안. PR #74 squash merge(`590693c`): 가져오기 전용 원격·push 보호(`push_to`), 빈 체리픽(`OpStatus::Empty`·`skip`), 원격 끊기, 브랜치 복수 선택(cargo test 109, e2e 46). 행성 탄생 연출 제거                                                                                                                                                                                                                                             |
| 2026-10-02 | PR #75 squash merge(`dc1b1b3`). v0.5.1 버전 올림, CI · Rust all_os, Release 수동 실행                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-02 | v0.5.2 준비: 브랜치 클릭 토글, 원격 접기·은하 카드 ⋯ 다듬기, 고정 '내 은하' 탭(⌘/Ctrl+0), 빈 저장소의 새 브랜치를 원격 브랜치에서 시작(cargo test 110, e2e 46)                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-02 | PR #78 squash merge(`2583df3`). v0.5.2 버전 올림, CI · Rust all_os, Release 수동 실행                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-02 | PR #79 squash merge(`6cc5533`), Release → `ddugit v0.5.2` 초안. 카드 별·사이드바 ⋯ 잘 보이게                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-02 | PR #80 squash merge(`717cdba`). 창 제목 표시줄을 탭 줄로(macOS Overlay, Windows 자체 버튼, vitest 91, e2e 46)                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-04 | PR #81 squash merge(`3c8a3dc`). '내 은하' → '내 저장소', Apple 서명 준비 안내(Mac 없이 인증서 만들기)                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-04 | macOS 서명·공증 성공(테스트 run 37182544034, 공증 Accepted). `.p12` 형식 문제(OpenSSL 3) 자동 처리, dmg 안 앱 검증 단계. v0.5.3 버전 올림                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-04 | PR #83 squash merge(`d03d57c`), Release → `ddugit v0.5.3` 초안(첫 서명·공증 macOS 빌드)                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-04 | PR #84(우주 배경·빛 번짐 설정), #85(닫힌·병합된 PR) merge. `--rebase-merges` 정리(cargo test 113, vitest 93, e2e 47). M4 끝                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-04 | PR #86(병합 섞인 rebase), #87(v0.6.0, 출시 계획 M12~M16), #88(Supabase Storage 업로드) merge. v0.6.0 Release run 37188669909: 빌드는 됐지만 GitHub Release 초안 만들기가 403(Resource not accessible by integration)으로 실패                                                                                                                                                                                                                                                                      |
| 2026-10-04 | 사용자 결정: 원인은 파지 않고 GitHub Release를 쓰지 않는다. `release.yml`은 빌드 + artifact + Supabase 업로드만(`contents: read`). ddugit-site#1: 사이트 골격(홈·다운로드·가격·변경 내역·약관·개인정보 초안·계정 자리)                                                                                                                                                                                                                                                                             |
