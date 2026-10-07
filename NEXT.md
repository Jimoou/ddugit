# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-07_

## 방금 끝난 것

- v1.1.0 배포(누락 기능 1·2차)
- v1.1.1: v1.1.0에서 빠진 1차분(#134) 코드 점검과 2차 리뷰의 남은 작은 항목 수정
  - 보안: 심볼릭 링크인 `.gitignore`에 쓰지 않음(저장소 밖 파일에 덧붙일 수 있었음), 파일·패치 저장 경로는 Rust가 띄운 저장 창에서 고른 것만(`pick_save_file`), push 이름에 `*` 같은 패턴 거부, `commit.template`은 64KiB 이하 일반 파일만
  - squash 병합: 작업 트리가 깨끗할 때만, 충돌이면 `squash` 상태로 배너·취소, `merge.ff=false`에서도 동작, 커밋 창은 index 모드로 메시지 유지
  - 같은 이름 태그가 있어도 병합·rebase 대상은 브랜치, 원격 URL 바꾸면 push URL도, 실패한 clone 폴더 정리, 로컬 경로 shallow clone
  - 화면: 충돌 중 '모두 스테이지'가 충돌 파일을 해결로 만들지 않음, index 모드의 Stash·버리기는 스테이지된 파일 기준, 읽지 않은 이력이 있으면 rebase 확인 창이 "n개 이상"

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
