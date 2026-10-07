# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-07_

## 방금 끝난 것

- 앱: 원격 브랜치 삭제(원격 브랜치 메뉴 → "<원격>에서 삭제…", `remote::delete_remote_branch`)
- 사이트(ddugit-site #35–#40): 404·오류 페이지, 보안 점검 반영(확인된 이메일만 소유로 인정하는 RLS·`private.verified_email()`, 이중 환불 방지, IPv6 /64 rate limit), Git 가이드 4편(ddugit 중심, 스크린샷), 환불 정책 `/refunds`, 웹훅 발신 IP 확인(Paddle `/ips`, 기본 거부), 라이브에서 샌드박스 주문 무시
- Paddle 라이브 카탈로그(다른 세션에서 API로 생성): 상품 `pro_01m4ae8jk3zscgr59atfbe6hr8`, 가격 `pri_01m4ae8jtk87m1ke5f3ndda7ez`($29 일회), 웹훅 `ntfset_01m4ae8k3heajjsmfyh8k3qd91`, client token `live_a70264fd4cad5fdca1ffd808c01`. 사용자가 Website approval(`ddugit.com`)과 기본 결제 링크(`/checkout`) 설정 완료

## 진행 중

- 누락 기능 1차(#134)·2차 PR을 병합한 뒤 **코드·기능 점검 → v1.1.0 릴리스**(사용자 지시: "모든 구현을 마치면 코드랑 기능 점검하고, 결과 확인한 다음 릴리즈")
- 실기에서만 확인할 수 있는 것: 외부 열기(Finder·탐색기·터미널·편집기)와 GUI diff·merge 도구는 Linux 빌드의 argv 테스트로만 확인됨 → 릴리스 후 macOS·Windows에서 직접 확인

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
