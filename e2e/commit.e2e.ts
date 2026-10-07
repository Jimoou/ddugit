// Making commits: the composer, staging lines, editing past commits, identity and signatures.

import { expect, test } from "./fixtures";

test("adds a checkpoint from the + composer", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.fill("textarea.message", "Wire up minimap jump");
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  const snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.summary).toBe("Wire up minimap jump");
  expect(snap.changes).toEqual([]);
});

test("stages single lines picked in the diff", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path").first().click();
  const signs = page.locator("table.diff tr.ins td.sign, table.diff tr.rem td.sign");
  await signs.nth(0).click();
  await signs.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator("tr.picked")).toHaveCount(3);
  await expect(page.locator(".hunk-btn").first()).toHaveText(/^\s*선택한 3줄 스테이지$/);
  // Read the file before staging: the list refreshes (and may drop it) afterwards.
  const file = (await page.locator(".diff-sheet .file-list li.on .path").textContent())!;
  await page.locator(".hunk-btn").first().click();
  await demo.toast("스테이지했어요");
  expect((await demo.snapshot()).changes.find((c) => c.path === file)?.staged).toBeTruthy();
});

test("rewords and splits a past commit, and restores a file as of a commit", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(3));
  let snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const target = byId.get(snap.head.target!)!.parents[0];
  const later = byId.get(snap.head.target!)!.summary;

  // Reword the commit before HEAD; HEAD's commit is replayed on top.
  await expect.poll(async () => (await demo.screenOf(target)) !== null).toBe(true);
  const at = (await demo.screenOf(target))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=메시지 고치기…");
  const dialog = page.getByRole("dialog", { name: "메시지 고치기" });
  await dialog.getByLabel("커밋 메시지").fill("Better words");
  await dialog.getByRole("button", { name: "적용" }).click();
  await demo.toast("메시지를 고쳤어요");
  snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.summary).toBe(later);
  expect(snap.commits.find((c) => c.id === head.parents[0])!.summary).toBe("Better words");

  // Split the reworded commit by files (the demo shows a few files per commit).
  const reworded = head.parents[0];
  await expect.poll(async () => (await demo.screenOf(reworded)) !== null).toBe(true);
  const at2 = (await demo.screenOf(reworded))!;
  await page.mouse.click(at2.x, at2.y, { button: "right" });
  await page.click(".context-menu >> text=커밋 나누기…");
  const split = page.getByRole("dialog", { name: "커밋 나누기" });
  await split.locator(".split-files input").first().check();
  await split.getByRole("button", { name: "적용" }).click();
  await demo.toast("커밋을 둘로 나눴어요");
  expect((await demo.snapshot()).commits.length).toBe(snap.commits.length + 1);

  // Restore one of HEAD's files as it was before HEAD.
  const now = await demo.snapshot();
  const tip = (await demo.screenOf(now.head.target!))!;
  await page.mouse.click(tip.x, tip.y);
  const file = page.locator(".inspector .changed li:not(.dir)").first();
  await file.click({ button: "right" });
  await page.click(".context-menu >> text=이 커밋 이전 상태로");
  await expect(page.locator(".toast").filter({ hasText: "복원했어요" })).toBeVisible();
  expect((await demo.snapshot()).changes.some((c) => c.staged)).toBe(true);
});

test("identity: a profile made in settings is applied to the repository from the composer", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByRole("tab", { name: "프로필" }).click();
  const profiles = dialog.locator("section.profiles");
  await expect(profiles.locator(".global-identity")).toContainText("Demo Pilot <pilot@ddugit.dev>");
  // First use: offered to start from the global identity.
  await expect(profiles.locator(".offer")).toContainText("첫 프로필");

  await profiles.getByRole("button", { name: "+ 프로필 추가" }).click();
  await profiles.getByPlaceholder("you@example.com").fill("kim.corp.example");
  await profiles.getByPlaceholder("Hong Gildong").fill("Kim Work");
  await profiles.getByRole("button", { name: "저장", exact: true }).click();
  await expect(profiles.locator(".note.warn")).toHaveText("이메일 형식이 아니에요");
  await profiles.getByPlaceholder("you@example.com").fill("kim@corp.example");
  await profiles.locator(".profile-form select").selectOption("ssh");
  await profiles.getByPlaceholder(/공개 키 경로/).fill("/home/pilot/.ssh/id_ed25519.pub");
  await profiles.getByRole("button", { name: "저장", exact: true }).click();
  await expect(profiles.locator(".profile-list li")).toContainText("Kim Work <kim@corp.example>");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).profiles)).toEqual([
    { name: "Kim Work", email: "kim@corp.example", signing: { format: "ssh", key: "/home/pilot/.ssh/id_ed25519.pub" } },
  ]);
  await dialog.getByRole("button", { name: "닫기" }).click();

  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const line = page.locator(".composer .identity-line");
  await expect(line.locator(".who")).toHaveText("Demo Pilot <pilot@ddugit.dev>");
  await expect(line.locator(".scope")).toHaveText("전역");
  await line.getByRole("button", { name: "커밋할 사람 바꾸기" }).click();
  await page
    .locator(".context-menu")
    .getByRole("menuitem", { name: /Kim Work/ })
    .click();
  await demo.toast("이 저장소는 Kim Work로 커밋해요");
  await expect(line.locator(".who")).toHaveText("Kim Work <kim@corp.example>");
  await expect(line.locator(".scope")).toHaveText("이 저장소");
  await expect(line.locator(".signs")).toBeVisible();

  // Commits made now are signed, and the inspector says so.
  await page.fill("textarea.message", "Signed by the work profile");
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  const head = (await demo.snapshot()).head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(".inspector .signature")).toHaveText("서명됨");

  // Back to the global identity.
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await line.getByRole("button", { name: "커밋할 사람 바꾸기" }).click();
  await page.locator(".context-menu").getByRole("menuitem", { name: "전역 설정 따르기" }).click();
  await expect(line.locator(".who")).toHaveText("Demo Pilot <pilot@ddugit.dev>");
  await expect(line.locator(".signs")).toHaveCount(0);
});

test("inspector: shows whether a commit is signed", async ({ demo }) => {
  const { page } = demo;
  const head = (await demo.snapshot()).head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  const sig = page.locator(".inspector .signature");
  await expect(sig).toHaveText("서명됨");
  await expect(sig).toHaveAttribute("title", /Jimin <jimin@ddugit.dev>/);
  await page.locator(".inspector .sha.parent").first().click();
  await expect(page.locator(".inspector h2")).toHaveText("Minimap");
  await expect(sig).toHaveText("서명됨 (확인 안 됨)");
  await page.locator(".inspector .sha.parent").first().click();
  await expect(page.locator(".inspector h2")).toHaveText("Semantic zoom levels");
  await expect(sig).toHaveCount(0);
});

test("stashes picked files, finds the stash on the graph, and applies, pops and drops stashes", async ({ demo }) => {
  const { page } = demo;
  const head = (await demo.snapshot()).head.target!;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  // Only the renderer: unpick everything, then pick that one file.
  await composer.locator(".files-head input[type=checkbox]").uncheck();
  await composer.locator(".files li", { hasText: "src/graph/renderer.ts" }).locator("input").check();
  await page.fill("textarea.message", "half-done glow");
  await composer.getByRole("button", { name: /스태시에 보관/ }).click();
  const save = page.getByRole("dialog", { name: "스태시에 보관" });
  await expect(save.getByLabel("메시지 (선택)")).toHaveValue("half-done glow");
  await save.getByRole("button", { name: "보관", exact: true }).click();
  await demo.toast("스태시에 보관했어요");
  let snap = await demo.snapshot();
  expect(snap.stashes.map((s) => s.message)).toEqual([
    "On feature/graph-zoom: half-done glow",
    "On main: try warmer glow palette",
  ]);
  expect(snap.stashes[0].base).toBe(head);
  expect(snap.changes.map((c) => c.path)).not.toContain("src/graph/renderer.ts");
  const side = page.locator(".sidebar section", { has: page.locator("h3", { hasText: "스태시" }) });
  await expect(side.locator("li")).toHaveCount(2);

  // The new stash hangs off HEAD on the graph as a diamond; clicking it opens the stash.
  await expect.poll(() => page.evaluate(() => window.__ddugit.stashScreenOf(0))).not.toBeNull();
  const at = (await page.evaluate(() => window.__ddugit.stashScreenOf(0)))!;
  await page.mouse.click(at.x, at.y);
  const panel = page.locator(".stash-panel");
  await expect(panel.locator("h2")).toHaveText("half-done glow");
  await expect(panel.locator(".eyebrow")).toContainText("stash@{0}");
  await expect(panel.locator(".meta code.sha")).toHaveText(head.slice(0, 7));
  await expect(side.locator("li.focused")).toHaveText("half-done glow");

  // Apply keeps the stash.
  await panel.getByRole("button", { name: /^적용/ }).click();
  await demo.toast("스태시를 적용했어요");
  snap = await demo.snapshot();
  expect(snap.changes.map((c) => c.path)).toContain("src/graph/renderer.ts");
  expect(snap.stashes).toHaveLength(2);

  // Pop the older one (from the sidebar): its file comes back and the stash is gone.
  await side.locator("li", { hasText: "try warmer glow palette" }).click();
  await expect(panel.locator("h2")).toHaveText("try warmer glow palette");
  await panel.getByRole("button", { name: /꺼내기/ }).click();
  await demo.toast("스태시를 꺼냈어요");
  snap = await demo.snapshot();
  expect(snap.changes.map((c) => c.path)).toContain("src/App.css");
  expect(snap.stashes.map((s) => s.message)).toEqual(["On feature/graph-zoom: half-done glow"]);
  await expect(panel).toHaveCount(0);

  // Drop asks first; cancelling keeps it.
  await side.locator("li").first().click();
  await panel.getByRole("button", { name: /삭제/ }).click();
  const confirm = page.getByRole("dialog", { name: "스태시 삭제" });
  await expect(confirm).toContainText("“half-done glow” 스태시를 지워요");
  await confirm.getByRole("button", { name: "취소" }).click();
  expect((await demo.snapshot()).stashes).toHaveLength(1);
  await panel.getByRole("button", { name: /삭제/ }).click();
  await confirm.getByRole("button", { name: "삭제" }).click();
  await demo.toast("스태시를 삭제했어요");
  expect((await demo.snapshot()).stashes).toEqual([]);
  await expect(side).toHaveCount(0);
});

test("stages a whole hunk from the diff sheet and takes it back from the staged tab", async ({ demo }) => {
  const { page } = demo;
  const file = "src/graph/renderer.ts";
  const change = async () => (await demo.snapshot()).changes.find((c) => c.path === file);
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path", { hasText: file }).click();
  const sheet = page.locator(".diff-sheet");
  await expect(sheet.getByRole("tab", { name: "변경" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.locator(".file-list li.on .path")).toHaveText(file);
  await sheet.getByRole("button", { name: "이 부분 스테이지", exact: true }).click();
  await demo.toast("스테이지했어요");
  expect(await change()).toMatchObject({ staged: "modified", unstaged: null });

  await sheet.getByRole("tab", { name: "스테이지됨" }).click();
  await expect(sheet.getByRole("tab", { name: "스테이지됨" })).toHaveAttribute("aria-selected", "true");
  await sheet.locator(".file-list li", { hasText: file }).click();
  await expect(sheet.locator(".file-list li.on .path")).toHaveText(file);
  await sheet.getByRole("button", { name: "이 부분 스테이지에서 내리기", exact: true }).click();
  await demo.toast("스테이지에서 내렸어요");
  expect(await change()).toMatchObject({ staged: null, unstaged: "modified" });
});

test("discarding picked files asks first, and only those files are restored", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  await composer.locator(".files-head input[type=checkbox]").uncheck();
  await composer.locator(".files li", { hasText: "src/graph/minimap.ts" }).locator("input").check();
  await composer.getByRole("button", { name: "선택 버리기" }).click();
  const dialog = page.getByRole("dialog", { name: "변경 버리기" });
  await expect(dialog.locator("li")).toHaveText(["src/graph/minimap.ts"]);
  // Cancel: nothing is lost.
  await dialog.getByRole("button", { name: "취소" }).click();
  expect((await demo.snapshot()).changes).toHaveLength(3);

  await composer.getByRole("button", { name: "선택 버리기" }).click();
  await dialog.getByRole("button", { name: "1개 파일 버리기" }).click();
  await demo.toast("변경을 버렸어요");
  expect((await demo.snapshot()).changes.map((c) => c.path)).toEqual(["src/graph/renderer.ts", "README.md"]);
});

test("inspector: copies the commit id, lists the branches holding it, and says when copying fails", async ({
  demo,
}) => {
  const { page } = demo;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  const at = (await demo.screenOf(head.id))!;
  await page.mouse.click(at.x, at.y);
  const inspector = page.locator(".inspector");
  await inspector.locator(".sha.parent").click();
  await expect(inspector.locator("h2")).toHaveText("Minimap");
  // Minimap is in the branch and in the remote branch it was pushed to, not in main.
  const contained = inspector.locator(".contained");
  await expect(contained).toContainText("들어 있는 브랜치");
  await expect(contained).toContainText("feature/graph-zoom");
  await expect(contained).toContainText("origin/feature/graph-zoom");
  await expect(contained).not.toContainText("main");

  const sha = inspector.getByTitle("클릭해서 복사");
  await sha.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(head.parents[0]);

  // A clipboard that refuses (no permission) is reported instead of failing silently.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  });
  await sha.click();
  await demo.toast("클립보드에 복사하지 못했어요");
});

test("changes the author of a past commit and replays the commits after it", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const head = before.commits.find((c) => c.id === before.head.target)!;
  const target = before.commits.find((c) => c.id === head.parents[0])!;
  await (await demo.commitMenu(target.id)).getByText("작성자 바꾸기…").click();
  const dialog = page.getByRole("dialog", { name: "작성자 바꾸기" });
  await expect(dialog.getByLabel("이름")).toHaveValue(target.author);
  await expect(dialog.getByLabel("이메일")).toHaveValue(target.email);
  await expect(dialog).toContainText("커밋 2개를 다시 써요");
  await dialog.getByLabel("이름").fill("Stella Park");
  await dialog.getByLabel("이메일").fill("stella@ddugit.dev");
  await dialog.getByRole("button", { name: "적용" }).click();
  await demo.toast("작성자를 바꿨어요");

  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const tip = byId.get(snap.head.target!)!;
  const edited = byId.get(tip.parents[0])!;
  expect(tip.summary).toBe(head.summary);
  expect([edited.summary, edited.author, edited.email]).toEqual([target.summary, "Stella Park", "stella@ddugit.dev"]);
  expect(edited.parents).toEqual(target.parents);
});

test("inspector: a changed file opens the commit's diff sheet, read-only", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  const at = (await demo.screenOf(head.id))!;
  await page.mouse.click(at.x, at.y);
  const files = page.locator(".inspector .changed li:not(.dir)");
  await expect(files).not.toHaveCount(0);
  const n = await files.count();
  await files.first().click();

  const sheet = page.locator(".diff-sheet");
  await expect(sheet.locator("header b")).toHaveText(head.summary);
  await expect(sheet.locator("header")).toContainText(`파일 ${n}개`);
  await expect(sheet.locator(".file-list li")).toHaveCount(n);
  await expect(sheet.locator(".file-list li.on")).toHaveCount(1);
  await expect(sheet.locator("table.diff tr.ins").first()).toBeVisible();
  // A commit's diff has no staging: no tabs, no hunk buttons.
  await expect(sheet.getByRole("tab")).toHaveCount(0);
  await expect(sheet.locator(".hunk-btn")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("the diff sheet steps through files with [ and ], and draws only the rows near view in a long file", async ({
  demo,
}) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path").first().click();
  const sheet = page.locator(".diff-sheet");
  const current = sheet.locator(".file-list li.on .path");
  // The unstaged changes: the modified renderer and the new minimap (README is staged only).
  await expect(sheet.locator(".file-list li")).toHaveCount(2);
  const files = await sheet.locator(".file-list li .path").allTextContents();
  await expect(current).toHaveText(files[0]);
  await page.keyboard.press("]");
  await expect(current).toHaveText(files[1]);
  await page.keyboard.press("[");
  await expect(current).toHaveText(files[0]);
  // Past the first file it wraps around to the last.
  await page.keyboard.press("[");
  await expect(current).toHaveText(files[files.length - 1]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // A 3,000-line file: only the rows around the viewport are in the table.
  await demo.mutateQuietly((d) => {
    const lines = Array.from({ length: 3000 }, (_, i) => ({
      kind: "+" as const,
      old: null,
      new: i + 1,
      text: `line ${i + 1}`,
    }));
    d.diffs = [
      {
        path: "big.txt",
        oldPath: null,
        status: "added",
        additions: 3000,
        deletions: 0,
        binary: false,
        truncated: false,
        hunks: [{ header: "@@ -0,0 +1,3000 @@", key: "big", lines }],
      },
    ];
  });
  const snap = await demo.snapshot();
  const at = (await demo.screenOf(snap.head.target!))!;
  await page.mouse.click(at.x, at.y);
  await page.locator(".inspector .changed li:not(.dir)").first().click();
  const rows = sheet.locator("table.diff tr.ins");
  await expect(rows.first()).toContainText("line 1");
  expect(await rows.count()).toBeLessThan(400);
  await sheet.locator(".diff-body").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(rows.last()).toContainText("line 3000");
  expect(await rows.count()).toBeLessThan(400);
});

test("a commit refused while signing explains what signing needs", async ({ demo }) => {
  const { page } = demo;
  const before = (await demo.snapshot()).head.target;
  await demo.mutateQuietly((d) => (d.signFail = "gpg"));
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.fill("textarea.message", "Signed work");
  await page.keyboard.press("Control+Enter");
  const toast = page.locator(".toast.err");
  await expect(toast).toContainText("gpg failed to sign the data");
  await expect(toast).toContainText("pinentry");
  // Nothing was committed, and the message is still there to try again.
  expect((await demo.snapshot()).head.target).toBe(before);
  await expect(page.locator("textarea.message")).toHaveValue("Signed work");

  await demo.mutateQuietly((d) => (d.signFail = "ssh"));
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".toast.err").last()).toContainText("ssh-agent");
});

test("a stash that conflicts when popped stops on the conflicts and is kept", async ({ demo }) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => (d.conflictNext = true));
  const side = page.locator(".sidebar section", { has: page.locator("h3", { hasText: "스태시" }) });
  await side.locator("li").first().click();
  await page
    .locator(".stash-panel")
    .getByRole("button", { name: /꺼내기/ })
    .click();
  await expect(page.locator(".conflict-sheet")).toBeVisible();
  await expect(page.locator(".conflict-sheet header")).toContainText("남은 파일 2개");
  const snap = await demo.snapshot();
  // The stash stays for another try; a stash isn't an operation to continue or cancel.
  expect(snap.stashes).toHaveLength(1);
  expect(snap.state).toBe("clean");
  expect(snap.changes.filter((c) => c.conflicted)).toHaveLength(2);
  await expect(page.locator(".banner", { hasText: "진행 중" })).toHaveCount(0);
});

test("stages a new, untracked file from the diff sheet as an added file", async ({ demo }) => {
  const { page } = demo;
  const file = "src/graph/minimap.ts";
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path", { hasText: file }).click();
  const sheet = page.locator(".diff-sheet");
  await expect(sheet.locator(".file-list li.on .path")).toHaveText(file);
  // All of a new file's lines are additions.
  await expect(sheet.locator("table.diff tr.rem")).toHaveCount(0);
  await expect(sheet.locator("table.diff tr.ins")).not.toHaveCount(0);
  await sheet.getByRole("button", { name: "이 부분 스테이지", exact: true }).click();
  await demo.toast("스테이지했어요");
  expect((await demo.snapshot()).changes.find((c) => c.path === file)).toMatchObject({
    staged: "added",
    unstaged: null,
  });
});

test("identity: the signing key field suggests the GPG and SSH keys found on this computer", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByRole("tab", { name: "프로필" }).click();
  const profiles = dialog.locator("section.profiles");
  await profiles.getByRole("button", { name: "+ 프로필 추가" }).click();
  const form = profiles.locator(".profile-form");
  const suggested = form.locator("datalist#signing-keys option");
  await form.locator("select").selectOption("openpgp");
  await expect(suggested).toHaveCount(1);
  await expect(suggested).toHaveAttribute("value", "3AA5C34371567BD2");
  await expect(suggested).toHaveText("Demo Pilot <pilot@ddugit.dev>");
  await form.locator("select").selectOption("ssh");
  await expect(suggested).toHaveAttribute("value", "/home/pilot/.ssh/id_ed25519.pub");
  // The field points at the list, so the browser offers them while typing.
  await expect(form.locator("input[list=signing-keys]")).toBeVisible();
});
