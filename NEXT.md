# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-04_

## 방금 끝난 것

- v0.7.0 버전 올림(이 PR) → merge 후 main에서 Release 수동 실행(`release: true`). Free / Pro, 다듬기, M17 Pro 기능 넷
- 사이트 가격표·첫 화면에 새 Pro 기능(ddugit-site#15)

## 결정 (2026-10-04, 수익 모델)

- Free / Pro. Pro: 비공개·회사 서버 PR 연동, 백포트 실행(보기는 Free), 대시보드 3개 초과. 14일 체험. 구독이 끝나면 Pro만 잠김. 앱 쪽은 이 PR(`pro.rs`, 잠금 UI)
- 다음: 사이트 가격 페이지 Free / Pro 비교표·약관, 그다음 M15 결제(Lemon Squeezy 상품 이름 "ddugit Pro"), M17 새 Pro 기능(폐쇄망 반출입, 스택 브랜치, 릴리스 노트, 여러 저장소 일괄 작업)

## 다음 단계

- 사용자: v0.6.1 → v0.7.0 자동 업데이트 확인(macOS), Windows 실기 점검
- M15 마지막: Lemon Squeezy(사용자: 스토어·상품 월 ₩4,900 / 연 ₩49,000) → 웹훅 Edge Function(구독 생성·갱신·해지 → `licenses`, 첫 라이선스 발급 메일), 사이트 가격 페이지 구매 버튼, 앱 `BUY_URL`, 결제부터 앱 활성화까지 확인
- 사용자: 라이선스 발급 키 → Supabase Edge Functions Secrets(`DDUGIT_LICENSE_PRIVATE_KEY`, `DDUGIT_LICENSE_PUBKEY`) + ddugit Variables `DDUGIT_LICENSE_PUBKEY`
- 사용자: Windows 실기 점검, 세무(사업자등록·통신판매업), 오늘 끝나면 두 저장소 비공개로
- M16: 첫 실행 안내, 영문 문구 점검, 문제 신고 경로, 큰 저장소 성능 → v1.0.0
- 나중: 사이트 "문서" 메뉴(사용법·변경 내역)

## 결정 (2026-10-04)

- 오픈소스 아님, 저장소 비공개. GitHub Release를 만들지 않는다(배포는 ddugit.com, 파일은 Supabase Storage). Windows는 서명 없이. 다운로드·앱 사용에 로그인 없음, 구매·라이선스에만 로그인.

## 막힌 것 / 결정 필요

- 브랜치 보호 규칙(`main` 직접 push 금지, CI 필수)은 사용자가 GitHub 설정에서 켜야 한다.

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋과 커밋하지 않은 변경을 막으므로, PR CI가 도는 동안의 다음 작업은 `git stash`에 두거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.

## 알아둘 것

- 작업 브랜치: `claude/sync-common-errors-both-projects-dyt6jg`
- 데모: `npm run dev`
  - e2e 좌표: `window.__ddugit.screenOf(id)`
  - 데모 상태: `import("/src/mock.ts")`
  - 인증 실패 재현: `window.__ddugitDemo.failNextRemote = "https" | "ssh"`
  - 긴 직선 이력 만들기: `window.__ddugitDemo.grow(20)` 후 `window.dispatchEvent(new Event("focus"))`
  - 회전한 채로 열기: `localStorage["ddugit.settings"] = '{"rotation":3}'`
  - 은하 대시보드: `localStorage["ddugit.recent"]`에 경로를 넣고(그룹은 항목의 `group` + `localStorage["ddugit.groups"]`) 새로고침 → 새 탭. 데모의 각 경로는 경로 해시로 만든 상태, `gone`이 든 경로는 찾을 수 없음
  - 데모에는 원격에만 있는 브랜치 `origin/feature/orbit-sync`가 있다
  - 데모에는 서브모듈 둘(하나는 초기화 안 됨)과 LFS(패턴 둘, 받지 않은 파일 셋)가 있다. worktree는 `api.worktree("demo", …)`로 추가
- mock.ts를 고친 뒤에는 vite를 다시 띄운다. 그러지 않으면 `import("/src/mock.ts")`가 앱과 다른 모듈 인스턴스를 가져온다(HMR `?t=`)
- 데모의 첫 Fetch는 `origin/main`과 현재 브랜치의 upstream에 동료 커밋을 하나씩 추가한다.
- Rust 테스트의 git은 로컬 폴더 원격을 허용한다(`mod.rs` `command()`의 `#[cfg(test)]`, 서브모듈 테스트용).
- 실제 앱을 Linux에서 확인하는 법: Xvfb로 띄우고 `xdotool`로 클릭, `import -window root`로 스크린샷.
- `pkill -f "vite --port 1420"`은 셸 자신까지 죽인다. `pkill -f "[v]ite --port 1420"`을 쓴다.
- 릴리스 절차는 CLAUDE.md에 있다.
