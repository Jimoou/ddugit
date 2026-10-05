# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-05_

## 방금 끝난 것

- 수익 모델 변경: **$29 한 번 결제, 평생 사용 + 모든 업데이트, 라이선스당 기기 3대, 체험 없음**. 앱 #116(`device.rs`, 기기에 묶인 라이선스, 해제, 24시간마다 온라인 확인), 사이트 ddugit-site#21(가격·`devices` 표·활성화 때 기기 수 확인·`license-deactivate`·계정 페이지 기기 목록·refresh가 해제된 기기에 `removed`)
- M18 GitKraken 대비 기능: 내 저장소에서 clone·원격 추가(#109), 커밋할 사람 프로필·커밋 서명(#110), 앱에서 PR·MR 만들기(#111)
- M18 데스크톱 UI/UX 점검 4묶음: 작은 창 레이아웃(#112), 키보드·포커스 `useDialog`(#113), 문구·조사 처리(#114), 시각적 통일 `Segmented`·`.dialog-title`·설정 구역 메뉴(#115)

## 결정 (2026-10-05, 수익 모델)

- 구독 없음. Pro = 평생 라이선스 $29(사이트 `PRO_PRICE`). 기기 = 앱의 기기 ID(키체인 + 설정 폴더), 서버에는 SHA-256만. 4번째 기기는 활성화 페이지에서 기존 기기를 해제해야 함
- 해제된 기기·환불은 다음 온라인 확인 때 꺼짐. 계속 오프라인인 기기는 막지 않는다(의도한 빈틈)
- 사이트 라이선스(붙여 넣기, 폐쇄망)는 기기 제한 없음. Free/Pro 기능 경계는 그대로
- 앱·사이트 규약: 세션 scratchpad의 `lifetime/CONTRACT.md`가 원본이었고, 구현된 내용은 사이트 `supabase/functions/_shared/license.ts`와 앱 `license.rs`·`activate.rs`가 기준

## 다음 단계

- 릴리스 v0.8.0(평생 라이선스가 들어간 첫 버전, 사용자 확인 후)
- 사용자: Supabase 배포 workflow 성공 확인(마이그레이션 `20261005100000_lifetime_devices.sql`, `license-deactivate`), `licenses`에 시험 행(`kind='personal'`, `plan='lifetime'`, `status='active'`, `text=''`)으로 활성화 → 해제 → 재활성화 실제 확인
- 사용자: Lemon Squeezy 상품을 Single payment $29로. 승인 나면 M15 웹훅(주문 → `licenses` 행 `store_order_id`, 환불 → `status='refunded'`), 사이트 구매 버튼(체크아웃 URL)
- 실제 GitHub·GitLab API로 저장소 목록·PR·MR 만들기 확인(가짜 서버로만 시험함)
- 로컬 e2e "adds a remote from the GitHub tab"이 부하에서 자주 시간 초과(단독·CI는 통과) — 기다리는 조건을 튼튼하게
- M16: 첫 실행 안내, 영문 문구 점검, 문제 신고 경로, 큰 저장소 성능 → v1.0.0

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
