# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-12_

## 지금: v1.4.3 릴리스 (진짜 목록 보기 #166, UI 수정 #165)

- 사용자 요청(2026-10-12): 작업 기록 글자 겹침, 사이드바 원격 줄 배경 제거·'받기만' 배지 정렬, 섹션 +/… 간격(#165), '목록 보기'를 지도 회전 대신 진짜 목록으로
- 목록: `graph/CommitList.tsx`(`settings.listView`). 그래프 열 캔버스 + 가상 스크롤 행, `GraphHandle` 구현. HUD는 목록에서 HEAD·목록 버튼만
- Windows 서명: 사용자가 라이선스(인증서) 문제를 더 고민하기로 함. 선택지 정리는 대화에: 스토어(MSIX, 무료) / Certum 개인 / SSL.com 개인 / Azure(사업자 필요)
- Paddle 판매자 검증: 목요일(10/15)까지 기다린 뒤 지원팀 문의
- 직전: v1.4.2 릴리스(목록 보기 커밋 메시지 바탕 판)

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
