# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-12_

## 지금: v1.4.1 릴리스 (커밋 메시지 점 아래 두 줄 + 바탕 판, #161) · ddugit.com 스크린숏 갱신

- 사용자 요청(2026-10-12): 개선안 중 안 2(점 아래 가운데, 두 줄까지)에 안 1(바탕 판)을 합쳐 구현, 레인 간격 더 넓게
- 구현: `scene.ts`의 `COL` 84→136·`LANE` 62→80. `captions.ts`는 점 아래 가운데 상자(두 줄 → 한 줄 → 점 위 → 생략, 중요한 것부터). 렌더러의 `captionShapes`(단어 단위 두 줄 접기, 줄임표)·`drawCaptionPanel`(바탕 판, 켜진 것·우주는 레인 색 테두리). 선 장애물·연결선은 없어졌다
- 대가: 한 화면의 커밋이 약 60%. e2e는 화면 밖 커밋을 `demo.reveal`로 데려온다
- ddugit.com: 계기판 기본·새 메시지 모양으로 스크린숏을 다시 찍는다(사용자 요청)
- 직전: v1.4.0 릴리스(브랜치맵 테마, #159·#160)

## 남은 일

앱 기능 마일스톤은 모두 끝났다. 전체 목록은 [ROADMAP.md](ROADMAP.md)의 '남은 마일스톤'.

### 사용자

1. Paddle 판매자 검증 통과 대기
2. 통과 후 한 번에 전환: Supabase Secrets(`PADDLE_ENV` 삭제, `PADDLE_PRODUCT_ID`·`PADDLE_WEBHOOK_SECRET`·`PADDLE_API_KEY` 라이브 값, `ALLOW_TEST_LICENSES` 비움), Netlify(`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`·`_PRICE_ID` 라이브 값, `_ENV=production`, `ALLOW_TEST_LICENSES` 비움) → 재배포 → 샌드박스 웹훅 목적지 끄기 → 실결제·환불 1회 확인
3. 상품 생성에 쓴 라이브 API 키는 권한을 customer 읽기·adjustment 쓰기로 줄인 키로 바꾼다
4. Windows 실기 점검(창 버튼·크기 조절·SmartScreen), 외부 열기·편집기·저장 창·diff/merge 도구(macOS·Windows)
5. Supabase Auth → Sessions: 최대 기간·미사용 제한(선택), Providers에서 Email·Phone·Anonymous 꺼짐 확인
6. git-scm.com GUI 목록 PR(파일은 세션에서 전달: `data/guis/ddugit.yml`, 이미지 588×332/294×166, order 61)
7. Search Console: sitemap 재제출, `/guides`·가이드 4편 색인 요청

### 나중에

- Windows 코드 서명, 레이아웃 Worker·WebGL(측정상 불필요), 라이트 모드의 결과 효과가 옅은 것
- PR 알림 구독은 새 저장소 이름 `Jimoou/ddugit`으로 한다

## 결정

- 오프라인 활성화 코드는 지금 방식 유지(기기에 묶지 않음, IntelliJ 방식)
- 비교 페이지(경쟁사)는 만들지 않는다
- Paddle Retain(`pwCustomer`)은 쓰지 않는다(일회 결제라 해당 없음)

## PR 운영 규칙 (중요)

- **GitGuardian 검사가 "진행 중"으로 멈춰 있으면 GitHub의 "검사 묶음 완료" 이벤트가 오지 않는다.** 그래서 PR을 올리면 `send_later`로 **10분 뒤** 확인을 예약하고, CI가 통과했으면 바로 squash merge한다. 사용자가 CI 상태를 알려줄 때까지 기다리지 않는다.
- CI는 새 push가 오면 이전 실행을 취소한다. Stop 훅이 push하지 않은 커밋과 커밋하지 않은 변경을 막으므로, PR CI가 도는 동안의 다음 작업은 `git stash`에 두거나 merge 후 rebase해서 push한다.
- `merge_pull_request`의 `expectedHeadSha`는 40자 전체 SHA여야 한다.
