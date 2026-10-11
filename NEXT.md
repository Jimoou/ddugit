# NEXT (갱신형)

> **갱신형 문서입니다.** 작업 단위가 끝날 때마다 **덮어씁니다.** 이력은 [ROADMAP.md](ROADMAP.md)의 작업 기록에 남깁니다.
> 컨텍스트가 압축되거나 새 세션을 시작하면 **이 파일부터 읽습니다.**

_마지막 갱신: 2026-10-11_

## 지금: v1.2.0 릴리스

- 담긴 것: 목록 보기 버튼·줌아웃 태그(#142), 사이드바 강조 문구 삭제(#143), 틀 A(#144), 라이트 모드(#145), 기본 테마 어둡게(사용자 결정: 업데이트해도 화면이 바뀌지 않게, 밝게·시스템은 설정에서)
- 순서: 버전 PR(이 PR) → CI · Rust `all_os` 수동 실행 → 병합 → main에서 Release(`release` 체크) 수동 실행 → 3개 작업(dmg·exe·downloads.json) 확인

## 방금 끝낸 것 (UI 개편 2단계: 라이트 모드)

- 설정 → 화면 → 테마(시스템·어둡게·밝게, 기본 시스템). `src/theme.ts`, `<html data-theme>`, Tauri 창 테마(`core:window:allow-set-theme`)
- CSS: `base.css`의 `:root[data-theme="light"]`(B 색). 나머지 파일의 하드코딩 색은 토큰·`color-mix`로 바꿈(`--violet` `--shade` `--map-strip` `--map-veil` 추가)
- 캔버스: `graph/ink.ts`의 `INK.dark`·`INK.light`. 종이 위 레인은 네온과 같은 색상의 진한 잉크(대비 4.5:1 이상, `ink.test.ts`). 밝은 테마는 빛 번짐 없음, 반짝임·끌기 선은 `source-over`
- 밝은 하늘: 우주 배경 켜면 인쇄된 성도(`space.ts` `drawAtlas`: 잉크 별 + 동심원·방사선, 하늘처럼 천천히 돎), 끄면 무지 종이 `#F6F4EF`. 시작 화면·대시보드도 같은 하늘
- e2e는 `colorScheme: dark`로 고정(Playwright 기본이 light라서), 테마 e2e 하나 추가
- 남은 것: 결과 순간 효과(`fx.css`의 별·폭발)는 흰 빛이라 종이 위에선 옅다. 필요하면 다음에

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
