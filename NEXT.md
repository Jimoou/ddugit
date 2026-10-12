# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-11_

## 지금: v1.3.2 릴리스

- 담긴 것: 대시보드 카드의 그룹 색 왼쪽 선 제거(#157). 그룹은 머리줄의 색 점·이름으로 구분
- 같이 담김(#158): 라이트 모드 결과 효과(흰 빛 대신 효과마다 잉크 색, 성운은 multiply), 사이드바 행의 +·눈 아이콘 세로 가운데 맞춤, 커밋 메시지 라벨 여백(높이 21px·좌우 9px)과 별에서 10px 떨어뜨려 얇은 선으로 잇기, '숨긴 브랜치 모두 보이기'·'선택 해제' 줄 제거(맵에서 Esc·빈 곳 클릭이 고른 브랜치도 해제)
- 다음(사용자 요청 2026-10-12): 브랜치맵 테마. 기본 = A 계기판 레인맵, 옵션 = B 노선도 레인맵·지금의 우주. A/B 배경은 인쇄된 성도가 기본. 목업은 캔버스 'ddugit UI 개편 목업'의 A·B
- 그대로 두기로 한 것(2026-10-12 사용자 결정): 그룹 저장소 탭 위쪽 2px 색 줄, 그룹 머리줄 점의 빛 번짐
- 순서: 버전 PR → CI · Rust `all_os` 수동 실행 → 병합 → main에서 Release(`release` 체크) → dmg·exe·downloads.json 확인
- 직전: v1.3.1(브랜치맵 글자 1px), ddugit.com을 앱 frame A 모습으로(ddugit-site#41)

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
