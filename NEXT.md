# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-08_

## 방금 끝난 것

- v1.1.1 배포(1차 누락 기능 점검 반영, 데모 기능 점검)
- v1.1.2(사용 후 피드백 8가지):
  - push 거부 사유: upstream이 없으면 무반응이던 것 → 토스트, 있으면 갈라짐 창 아래 git 출력(복사 가능)
  - 충돌 시트: 왜 충돌했는지(같은 부분·지움/고침·둘 다 만듦·바이너리), 양쪽의 마지막 변경 커밋과 '더 최근' 표시(`conflict/sides.rs`)
  - push·PR 창의 '외 N개' 누르면 전부(`CommitList`), 브랜치 메뉴 '강제 push (덮어쓰기)…'(`--force-with-lease`)
  - 백포트 새로고침(모든 원격 fetch), 지운 브랜치가 '이력 강조' 개수에서 빠짐, 커밋 창에 diff로 보고 있는 파일 표시
  - 오류 토스트: 마우스를 올리면 유지, 글자 선택·복사·닫기
- v1.1.2 UI 요청 6가지(같은 PR):
  - 사이드바·오른쪽 패널 너비 조절(`Splitter.tsx`, 끌기·화살표·두 번 눌러 기본값, 저장, 화면 폭 비율 상한)
  - 커밋 라벨: 레인 색 테두리 알약 + 종류 칩(`subject.ts`: feat/fix/docs…·merge·revert·fixup, `(#123)`), 30%(`ZOOM.briefs`)부터 짧게, 캔버스 끝에서 말줄임
  - 맵 잠금(HUD·L·설정: 끌면 이동만), 미니맵 켜기·끄기(HUD·M·설정), 인스펙터 메시지 카드 테두리
  - 데모 커밋 몇 개를 Conventional 형식으로(릴리스 노트 e2e 기대값 갱신)
  - 큰 저장소 30% 줌 그리기: 10만 커밋에서 약 3ms(docs/PERF.md)
- 충돌 화면 추가 개선 후보(아직 안 함): 양쪽이 base 대비 바꾼 것 보기, diff3 base 구간 표시, 쪽마다 커밋 목록, 줄별 blame, 이름 바뀜/지움 안내, 파일을 옮겨도 블록 선택 유지

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
