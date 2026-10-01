// Korean UI text: the source dictionary. Every key here must exist in en.ts
// (the type there enforces it) with the same {placeholders}.

export const ko = {
  // common
  "common.cancel": "취소",
  "common.close": "닫기",
  "common.closeEsc": "닫기 (Esc)",
  "common.none": "없음",
  "common.noMessage": "(메시지 없음)",

  // top bar
  "top.emptyRepo": "빈 저장소",
  "top.demo": "데모 모드",
  "top.fetch.title": "원격의 새 커밋을 가져오기만 합니다 (작업 트리는 그대로)",
  "top.pull.title": "원격 커밋을 받아 현재 브랜치에 반영합니다",
  "top.push.title": "내 커밋을 원격에 올립니다",
  "top.push.first": "처음 push: 원격에 브랜치를 만들고 연결합니다",
  "top.commit": "＋ 커밋",
  "top.refresh": "새로고침",
  "top.sparkle": "반짝임 효과",
  "top.settings": "설정과 단축키 (?)",
  "top.settings.label": "설정",
  "progress.Enumerating objects": "목록 작성",
  "progress.Counting objects": "개수 세는 중",
  "progress.Compressing objects": "압축 중",
  "progress.Writing objects": "올리는 중",
  "progress.Receiving objects": "받는 중",
  "progress.Resolving deltas": "정리 중",
  "progress.Updating files": "파일 갱신",

  // sidebar
  "side.search": "브랜치 찾기",
  "side.local": "브랜치",
  "side.remote": "원격",
  "side.tag": "태그",
  "side.stash": "스태시",
  "side.addRemote": "원격 저장소 추가",
  "side.hint.tag": "클릭: 집중해서 보기 · 우클릭: 메뉴",
  "side.hint.branch": "클릭: 집중해서 보기 · 더블클릭: 체크아웃 · 우클릭: 메뉴",

  // search
  "search.placeholder": "메시지 · 작성자 · SHA · 브랜치",
  "search.prev": "이전 (Shift+Enter)",
  "search.next": "다음 (Enter)",

  // merge dialog
  "merge.title": "병합",
  "merge.body": "<b>{source}</b>의 체크포인트들을 <b>{target}</b>에 이어 붙여 새 병합 커밋을 만듭니다.",
  "merge.switch": "먼저 {target} 브랜치로 체크아웃한 뒤 병합해요.",
  "merge.dirty": "커밋하지 않은 변경 {n}개가 있어요. 충돌하면 git이 병합을 거부할 수 있습니다.",
  "merge.go": "병합",
  "merge.going": "병합 중…",

  // changed files list
  "files.changed": "변경 파일",
  "files.openDiff": "diff 보기",

  // graph
  "graph.loadMore": "⋯ 이전 이력 더 불러오기",
  "graph.run": "커밋 {n}개 · 눌러서 펼치기",
  "graph.pending": "병합 대기 · 충돌 해결 후 커밋",
  "graph.commit": "커밋 {sha}",
  "graph.aria": "커밋 그래프. 화살표로 커밋 이동, Enter로 메뉴, + - 0 H로 확대·전체·HEAD",
  "graph.hint":
    "드래그 이동 · ⌘/Ctrl+휠 확대 · ⌘/Ctrl+F 검색 · 점을 끌어 다른 브랜치 끝에 놓으면 병합 · Shift+끌기 순서 옮기기",
  "graph.hint.truncated": " · 최근 {n}개 표시 중",
  "drag.merge:idle": "병합할 브랜치 끝으로 끌어다 놓으세요 · ⌥/Alt: cherry-pick · Shift: 순서 옮기기",
  "drag.merge:ok": "놓으면 병합합니다",
  "drag.merge:bad": "브랜치 끝(체크포인트)에만 놓을 수 있어요",
  "drag.pick:idle": "이 커밋을 복사할 브랜치 끝으로 끌어다 놓으세요",
  "drag.pick:ok": "놓으면 이 커밋을 복사(cherry-pick)합니다",
  "drag.pick:bad": "브랜치 끝(체크포인트)에만 놓을 수 있어요",
  "drag.move:idle": "현재 브랜치의 다른 커밋에 놓으면 그 바로 다음으로 옮겨요",
  "drag.move:ok": "놓으면 순서 정리 화면이 열려요",
  "drag.move:bad": "현재 브랜치의 일직선 구간 안에서만 옮길 수 있어요",

  // settings
  "settings.title": "설정",
  "settings.screen": "화면",
  "settings.language": "언어",
  "settings.language.system": "시스템 설정 따르기",
  "settings.sparkle": "반짝임 효과 (선을 따라 흐르는 빛, 새 커밋 터짐)",
  "settings.page": "한 번에 불러올 커밋",
  "settings.pageN": "{n}개",
  "settings.gitPath": "실행 파일",
  "settings.gitPath.placeholder": "비워 두면 PATH의 git",
  "settings.gitPath.apply": "확인하고 적용",
  "settings.gitPath.hint":
    "macOS에서 Finder로 실행하면 터미널의 PATH를 모를 수 있어요. 이럴 때 <code>/opt/homebrew/bin/git</code>처럼 직접 지정하세요.",
  "settings.shortcuts": "단축키",

  // shortcut table
  "keys.graph": "그래프",
  "keys.search": "검색",
  "keys.commit": "커밋과 변경",
  "keys.app": "앱",
  "keys.wheel": "휠",
  "keys.wheel.what": "시간축을 따라 이동",
  "keys.zoom": "⌘/Ctrl + 휠, 핀치",
  "keys.zoom.what": "커서 기준 확대·축소",
  "keys.shiftWheel": "Shift + 휠",
  "keys.shiftWheel.what": "위아래로 이동",
  "keys.plusMinus.what": "확대 / 축소",
  "keys.fit.what": "전체 보기",
  "keys.head.what": "HEAD로",
  "keys.dragMerge": "점 끌어 브랜치 끝에 놓기",
  "keys.dragMerge.what": "병합",
  "keys.altDrag": "⌥/Alt + 끌기",
  "keys.shiftDrag": "Shift + 끌기",
  "keys.shiftDrag.what": "현재 브랜치 커밋 순서 옮기기 (rebase)",
  "keys.rightClick": "우클릭",
  "keys.rightClick.what": "커밋·브랜치 메뉴",
  "keys.leftRight.what": "이전(부모) / 다음(자식) 커밋 선택",
  "keys.upDown.what": "위 / 아래 레인의 가까운 커밋",
  "keys.enter.what": "선택한 커밋의 메뉴",
  "keys.esc.what": "선택 해제",
  "keys.find.what": "커밋 검색",
  "keys.findStep.what": "다음 / 이전 결과",
  "keys.commitKey.what": "커밋 (작성 중일 때)",
  "keys.files.what": "diff에서 이전 / 다음 파일",
  "keys.lines": "줄 번호 클릭, Shift + 클릭",
  "keys.lines.what": "줄 단위로 고르기 (스테이징)",
  "keys.help.what": "설정과 단축키",
} as const;

export type Key = keyof typeof ko;
