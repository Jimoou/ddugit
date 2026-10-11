# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-11_

## 방금 끝난 것

- UI 개편 1단계 **틀 A(다크)**: 목업(claude.ai 캔버스 "ddugit UI 개편 목업")에서 사용자가 A 틀을 골랐다. 브랜치 맵 캔버스·은하 대시보드의 콘셉트·기능·UX는 그대로, 조작 요소만 바꿈
  - 토큰(`base.css`): `--chrome` `--bg` `--surface` `--raised` `--panel` `--line(-strong)` `--text` `--text-2` `--muted` `--faint` `--ui`(밝은 채움) `--ui-ink` `--ui-soft` `--hover` `--focus` `--radius(-lg)` `--shadow` `--scrim`. `--signal`·`--brackets`·`--scanlines`·`--glass` 없앰
  - 규칙은 CONVENTIONS.md 5절 "틀 A 규칙"
  - 지도 아래 도움말이 확대 버튼과 겹치던 것(오른쪽 패널을 열면) 수정
- 화면 확인: 스크린숏 투어(메인·인스펙터·diff·커밋 창·검색·메뉴·병합 창·브랜치 목록·충돌·설정·대시보드·새 탭) 전후 비교

- 이전: HUD '목록' 버튼, 줌아웃 태그 표시, 사이드바 강조 문구 삭제(v1.1.3 이후 미배포, 이번 개편과 함께 배포 예정)

## 다음 (UI 개편 2단계: 라이트 모드)

- 설정에 테마(시스템·어둡게·밝게), `:root[data-theme="light"]` 토큰(B 색: 종이 `#F6F4EF`, 패널 흰색, 글자 `#1C1C1A`, 채운 버튼 검정)
- 그래프 렌더러(`scene.ts`의 `NEON`, `renderer.ts`, `space.ts`, 미니맵)에 테마별 팔레트. 레인 색은 같은 색상(hue)의 진한 버전(청록 `#0B8FB3`, 분홍 `#CC3D60`, 민트 `#12936B`, 보라 `#6C52CC`, 주황 `#B77400` …). 라이트에서 빛 번짐은 끔
- 브랜치맵 배경: 목업에 후보 셋(① 무지 종이 ② 지도 격자 ③ 인쇄된 성도). **사용자 선택 대기**. '우주 배경' 끄면 ①

## 진행 중

- 실기에서만 확인할 수 있는 것: 외부 열기·편집기 확인 창·저장 창·diff·merge 도구(macOS·Windows)
- PR 알림 구독은 새 저장소 이름 `Jimoou/ddugit`으로 한다(옛 이름 `jimoou/otgit`으로는 이벤트가 오지 않음)

## 다음 단계 (사용자)

1. Paddle 판매자 검증 통과 대기
2. 통과 후 한 번에 전환: Supabase Secrets(`PADDLE_ENV` 삭제, `PADDLE_PRODUCT_ID`·`PADDLE_WEBHOOK_SECRET`·`PADDLE_API_KEY` 라이브 값, `ALLOW_TEST_LICENSES` 비움), Netlify(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`·`_PRICE_ID` 라이브 값, `_ENV=production`, `ALLOW_TEST_LICENSES` 비움) → 재배포 → 샌드박스 웹훅 목적지 끄기 → 실결제·환불 1회 확인
3. 상품 생성에 쓴 라이브 API 키는 권한을 customer 읽기·adjustment 쓰기로 줄인 키로 바꾼다
4. Supabase Auth → Sessions: 최대 기간·미사용 제한(선택), Providers에서 Email·Phone·Anonymous 꺼짐 확인
5. git-scm.com GUI 목록 PR(파일은 세션에서 전달: `data/guis/ddugit.yml`, 이미지 588×332/294×166, order 61)
6. Search Console: sitemap 재제출, `/guides`·가이드 4편 색인 요청

## 결정

- 오프라인 활성화 코드는 지금 방식 유지(기기에 묶지 않음, IntelliJ 방식)
- 비교 페이지(경쟁사)는 만들지 않는다
- Paddle Retain(`pwCustomer`)은 쓰지 않는다(일회 결제라 해당 없음)

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋과 커밋하지 않은 변경을 막으므로, PR CI가 도는 동안의 다음 작업은 `git stash`에 두거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.
