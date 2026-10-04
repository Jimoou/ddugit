# ddugit 브랜드 에셋

은하계 콘셉트의 git 관리 데스크탑 앱 ddugit의 아이콘, 워드마크, 락업 모음입니다.

## 구성

```
icon/
  svg/ddugit-icon.svg          마스터 (64px 이상)
  svg/ddugit-icon-small.svg    소형 전용 (48px 이하)
  png/ddugit-icon-{16~1024}.png  16·24·32·48은 소형 버전에서 출력
  macos/ddugit-icon-macos.svg  macOS 아이콘 그리드(824px 본체 + 그림자)
  macos/ddugit.icns            바로 쓸 수 있는 icns
  macos/ddugit.iconset/        Mac에서 `iconutil -c icns ddugit.iconset`로 재생성용
  windows/ddugit.ico           16·24·32·48·256 포함
wordmark/
  svg/  on-dark · on-light · mono-black · mono-white (텍스트 아웃라인 처리, 폰트 불필요)
  png/  각 @2x
lockup/
  svg/  아이콘 + 워드마크 가로형, on-dark · on-light
  png/  각 @2x
```

## 사용 규칙

- **크기별 아이콘:** 48px 이하에서는 반드시 `ddugit-icon-small`을 씁니다. 마스터를 축소하면 두 d 사이 간격이 무너져 붙어 보입니다.
- **d 간격:** 두 d는 항상 떨어져 있어야 합니다. 붙이거나 겹치는 변형은 만들지 않습니다.
- **플랫폼:** Windows·Linux는 꽉 찬 `ddugit-icon`, macOS는 `ddugit-icon-macos` 기반 icns를 씁니다.
- **워드마크 여백:** 사방으로 최소 별 하나 높이만큼 비웁니다.
- **워드마크 최소 크기:** 화면 기준 높이 20px. 그보다 작으면 아이콘만 씁니다.
- **단색:** 배경 위에 컬러 표현이 어려우면 mono-black / mono-white를 씁니다. 별 색만 바꾸는 등 부분 변경은 하지 않습니다.

## 색상

| 이름       | HEX                   | 용도                        |
| ---------- | --------------------- | --------------------------- |
| Deep Space | `#07071A`             | 아이콘 배경 하단, 다크 배경 |
| Nebula     | `#17173F`             | 아이콘 배경 상단            |
| Orbit      | `#8E86C8` / `#B4ABF2` | 궤도 (뒤 / 앞)              |
| Starlight  | `#F3F1FF`             | 다크 배경 위 글자           |
| Ink        | `#12142B`             | 라이트 배경 위 글자         |
| Star Gold  | `#FFC56B`             | 다크 배경 위 별             |
| Star Amber | `#D9822B`             | 라이트 배경 위 별           |
| Paper      | `#F6F5FB`             | 라이트 배경                 |

## 타이포그래피

- 워드마크: **Sora SemiBold(600)**, 자간 -3.5%, i의 점을 4각 별로 대체
- Sora는 SIL Open Font License라 상업적 사용과 아웃라인 가공이 가능합니다.
