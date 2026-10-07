// Remotes: pull and push, overwriting the upstream, remotes and pull requests.

import { expect, test } from "./fixtures";

test("overwrites the upstream after rewriting a pushed commit", async ({ demo }) => {
  const { page } = demo;
  const push = page.locator(".topbar button", { hasText: "Push" });
  await push.click();
  await demo.confirmSync();
  await demo.toast("원격에 올렸어요");

  // Reword the (now pushed) HEAD commit.
  const head = (await demo.snapshot()).head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=마지막 커밋 수정");
  await page.fill("textarea.message", "Reworded after review");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await demo.snapshot()).head.target).not.toBe(head);

  await push.click();
  await demo.confirmSync();
  const dialog = page.locator(".dialog", { hasText: "Push 거부됨" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /덮어쓰기/ }).click();
  await demo.toast("원격을 내 이력으로 덮어썼어요");
  const snap = await demo.snapshot();
  const upstream = snap.refs.find((r) => r.kind === "remote" && r.name === snap.head.upstream)!;
  expect(upstream.target).toBe(snap.head.target);
});

test("asks before pull and push, lists what moves, and can stop asking", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const ahead = before.head.ahead;
  await page.locator(".topbar button", { hasText: "Push" }).click();
  const ask = page.getByRole("dialog", { name: "Push" });
  await expect(ask).toContainText(before.head.upstream!);
  await expect(ask.locator(".sync-commits li")).toHaveCount(ahead);
  // Cancel: nothing left.
  await ask.getByRole("button", { name: "취소" }).click();
  expect((await demo.snapshot()).head.ahead).toBe(ahead);

  // Fetch only reads: it runs without asking.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");

  // Pull lists what comes in; "don't ask again" sticks.
  await page.locator(".topbar button", { hasText: "Pull" }).click();
  const pull = page.getByRole("dialog", { name: "Pull" });
  await expect(pull.locator(".sync-commits li")).not.toHaveCount(0);
  await pull.getByLabel(/다시 묻지 않기/).check();
  await pull.locator("button.primary").click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).confirmRemote.pull)).toBe(
    false,
  );
});

test("adds a remote from the GitHub tab, named after the owner", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".sidebar").getByTitle("원격 저장소 추가").click();
  const dialog = page.locator(".dialog.add-remote");
  await dialog.getByRole("tab", { name: "GitHub" }).click();
  await dialog.getByPlaceholder("내 저장소 검색").fill("design");
  await dialog.getByRole("option", { name: /orbit-labs\/design-system/ }).click();
  await expect(dialog.getByLabel("이름", { exact: true })).toHaveValue("orbit-labs");
  await expect(dialog).toContainText("→ https://github.com/orbit-labs/design-system.git");
  await dialog.getByRole("button", { name: "추가하고 가져오기" }).click();
  // The fetch plays out its progress card first; on a busy runner that alone can outlast an assertion's
  // default 5 s. Wait for its result (the remote's branch), then read the toast it raises right after.
  const added = page.locator(".sidebar section.remote-sub").filter({ hasText: "orbit-labs" });
  await expect(added.locator("li")).toHaveCount(1, { timeout: 20_000 });
  await demo.toast("orbit-labs에서 브랜치 1개를 가져왔어요");
});

test("a push rides a comet into orbit and fetched commits arrive as meteors, unless sparkles are off", async ({
  demo,
}) => {
  const { page } = demo;
  const launch = page.locator(".fx-clip .launch");
  const meteors = page.locator(".fx-clip .meteor");

  await page.getByRole("button", { name: /Push/ }).click();
  await demo.confirmSync();
  await demo.toast("원격에 올렸어요");
  await expect(launch).toHaveCount(1);
  await expect(launch).toHaveCount(0, { timeout: 5000 });

  // The demo's first fetch brings one commit to origin/main and one to the upstream.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await expect(meteors).toHaveCount(2);

  // Sparkles off (in settings): the same moments play nothing.
  await page.locator(".tabrow-settings").click();
  await page
    .getByRole("dialog", { name: "설정" })
    .getByLabel(/반짝임 효과/)
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(meteors).toHaveCount(0, { timeout: 5000 });
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await page.getByRole("button", { name: /Push/ }).click();
  await demo.confirmSync();
  await page.waitForTimeout(300);
  await expect(launch).toHaveCount(0);
});

test("lists open pull requests, checks one out, and connects or forgets a forge token", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".sidebar .pulls");
  const open = section.locator(":scope > ul > li");
  // `gh` is logged in (demo): open PRs show without asking, and there is no token to manage.
  await expect(open).toHaveCount(2);
  await expect(open.nth(0)).toContainText("#12");
  await expect(open.nth(1)).toContainText("초안");
  // CI and review state ride along: #12 passed and is approved, #15 failed.
  await expect(open.nth(0).locator(".pr-ci")).toHaveClass(/success/);
  await expect(open.nth(0)).toContainText("승인");
  await expect(open.nth(1).locator(".pr-ci")).toHaveClass(/failure/);
  await expect(section.getByRole("button", { name: "토큰 관리" })).toHaveCount(0);
  // Merged and closed ones sit in their own fold, with no label on the graph.
  const done = section.locator("section.sub");
  await expect(done).toContainText("닫힘·병합");
  await expect(done.locator("li")).toHaveCount(2);
  await expect(done.locator("li").nth(0)).toContainText("병합됨");
  await expect(done.locator("li").nth(1)).toContainText("닫힘");

  await open.nth(0).click({ button: "right" });
  await page.click(".context-menu >> text=feature/theme 브랜치 체크아웃");
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("feature/theme");

  // Without a login the section offers to connect; a pasted token is saved and can be forgotten.
  await demo.mutate((d) => (d.forgeToken = "none"));
  await page.getByRole("button", { name: /Fetch/ }).click(); // remote work re-reads pull requests
  await expect(section).toContainText("GitHub에 연결하면");
  await expect(open).toHaveCount(0);
  await section.getByRole("button", { name: "GitHub 연결" }).click();
  const dialog = page.getByRole("dialog", { name: "GitHub 연결" });
  await dialog.getByLabel("토큰").fill("ghp_demo");
  await dialog.getByLabel("토큰").press("Enter");
  await demo.toast("GitHub에 연결했어요");
  await expect(open).toHaveCount(2);

  await section.getByRole("button", { name: "토큰 관리" }).click();
  await dialog.getByRole("button", { name: "저장된 토큰 지우기" }).click();
  await demo.toast("저장된 토큰을 지웠어요");
  await expect(section.getByRole("button", { name: "GitHub 연결" })).toBeVisible();
});

test("the original project added as a remote is fetch-only: a push offers origin instead", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".sidebar").getByTitle("원격 저장소 추가").click();
  await page.fill(".dialog input >> nth=0", "upstream");
  await page.fill(".dialog input >> nth=1", "https://example.com/original.git");
  await page.click(".dialog button.primary");
  await demo.toast("upstream을 가져오기 전용으로 추가했어요. 이 원격에는 push하지 않아요");
  const upstream = page.locator(".sidebar section.remote-sub").filter({ hasText: "upstream" });
  await expect(upstream.locator(".fetch-only")).toBeVisible();

  // A branch that follows upstream/main.
  await upstream
    .locator("li")
    .filter({ hasText: /^main$/ })
    .dblclick();
  await page.locator(".dialog").getByRole("button", { name: "만들고 이동" }).click();
  await demo.toast(/upstream\/main을 로컬로/);
  expect((await demo.snapshot()).head.upstream).toBe("upstream/main");

  await page.locator(".topbar").getByRole("button", { name: /Push/ }).click();
  const ask = page.locator(".dialog.sync-confirm");
  await expect(ask).toContainText("가져오기 전용 원격이라 올리지 않아요");
  await expect(ask.getByRole("button", { name: /^Push/ })).toBeDisabled();
  await ask.getByRole("button", { name: "origin에 올리기" }).click();
  await demo.toast(/origin에 올렸어요/);
  expect((await demo.snapshot()).head.upstream).toBe("origin/upstream-main");
});

test("a remote can be disconnected from its menu, even the only one", async ({ demo }) => {
  const { page } = demo;
  const origin = page.locator(".sidebar section.remote-sub").filter({ hasText: "origin" });
  await origin.getByRole("button", { name: "origin 메뉴" }).click();
  await page.getByRole("menuitem", { name: "원격 origin 삭제…" }).click();
  await page.locator(".dialog").getByRole("button", { name: "삭제" }).click();
  await demo.toast("원격 origin을 삭제했어요");
  await expect(page.locator(".sidebar section.remote-sub")).toHaveCount(0);
  expect((await demo.snapshot()).remotes).toEqual([]);
});

test("a fetch or push refused for credentials explains the HTTPS setup and tries again", async ({ demo }) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => (d.failNextRemote = "https"));
  await page.getByRole("button", { name: /Fetch/ }).click();
  const dialog = page.locator(".dialog.auth");
  await expect(dialog.locator(".dialog-title")).toHaveText("인증 필요");
  await expect(dialog).toContainText("github.com에 HTTPS로 접속하지 못했어요");
  await expect(dialog.locator("code.url")).toHaveText("https://github.com/ddugit/ddugit-demo.git");
  // The steps (for this OS) carry commands to copy; git's own output is one click away.
  await expect(dialog.locator(".steps li").first().locator("code")).toContainText("credential.helper");
  await expect(dialog.locator(".ssh-setup")).toHaveCount(0);
  await dialog.getByText("git 출력 보기").click();
  await expect(dialog.locator("pre.raw")).toContainText("terminal prompts disabled");
  // The demo fails once: trying again goes through.
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog).toHaveCount(0);
  await demo.toast("원격 커밋을 가져왔어요");

  // A push refused the same way: retrying pushes without asking again.
  await demo.mutateQuietly((d) => (d.failNextRemote = "https"));
  await page.locator(".topbar button", { hasText: "Push" }).click();
  await demo.confirmSync();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator(".dialog.sync-confirm")).toHaveCount(0);
  // The first fetch brought a teammate's commit to the upstream, so this push is rejected next.
  await expect(page.locator(".dialog", { hasText: "Push 거부됨" })).toBeVisible();
});

test("a pull that can't fast-forward offers to merge", async ({ demo }) => {
  const { page } = demo;
  // The first fetch brings a teammate's commit to the upstream, beside our own unpushed one.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  const before = await demo.snapshot();
  expect([before.head.ahead, before.head.behind]).toEqual([1, 1]);
  const theirs = before.refs.find((r) => r.name === before.head.upstream)!.target;

  await page.locator(".topbar button", { hasText: "Pull" }).click();
  await demo.confirmSync();
  const dialog = page.getByRole("dialog", { name: "갈라진 이력" });
  await expect(dialog).toContainText("feature/graph-zoom");
  await expect(dialog.locator(".legend")).toContainText("내 커밋 1개");
  await expect(dialog.locator(".legend")).toContainText("원격 커밋 1개");
  await expect(dialog.getByRole("button", { name: /덮어쓰기/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: /^병합/ }).click();
  await demo.toast("병합해서 받았어요");
  const after = await demo.snapshot();
  const tip = after.commits.find((c) => c.id === after.head.target)!;
  expect(tip.parents).toEqual([before.head.target, theirs]);
  expect([after.head.ahead, after.head.behind]).toEqual([2, 0]);
});

test("a pull that can't fast-forward offers to rebase", async ({ demo }) => {
  const { page } = demo;
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  const before = await demo.snapshot();
  const mine = before.commits.find((c) => c.id === before.head.target)!;
  const theirs = before.refs.find((r) => r.name === before.head.upstream)!.target;

  await page.locator(".topbar button", { hasText: "Pull" }).click();
  await demo.confirmSync();
  const dialog = page.getByRole("dialog", { name: "갈라진 이력" });
  await dialog.getByRole("button", { name: /^리베이스/ }).click();
  await demo.toast("리베이스해서 받았어요");
  // My commit is copied on top of theirs: one line, still one ahead.
  const after = await demo.snapshot();
  const tip = after.commits.find((c) => c.id === after.head.target)!;
  expect(tip.summary).toBe(mine.summary);
  expect(tip.parents).toEqual([theirs]);
  expect([after.head.ahead, after.head.behind]).toEqual([1, 0]);
});

test("a rejected push merges the upstream in, then pushes", async ({ demo }) => {
  const { page } = demo;
  // A teammate pushed to our branch: the push is refused until their commit is merged in.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  const before = await demo.snapshot();
  const theirs = before.refs.find((r) => r.name === before.head.upstream)!.target;
  await page.locator(".topbar button", { hasText: "Push" }).click();
  await demo.confirmSync();
  const dialog = page.getByRole("dialog", { name: "Push 거부됨" });
  await expect(dialog).toContainText("origin/feature/graph-zoom");
  await dialog.getByRole("button", { name: /병합하고 Push/ }).click();
  await demo.toast("원격에 올렸어요");
  const after = await demo.snapshot();
  const tip = after.commits.find((c) => c.id === after.head.target)!;
  expect(tip.parents).toEqual([before.head.target, theirs]);
  expect(after.refs.find((r) => r.name === after.head.upstream)!.target).toBe(after.head.target);
  expect([after.head.ahead, after.head.behind]).toEqual([0, 0]);
});

test("a remote's menu copies its URL, fetches it alone, and blocks or allows pushing to it", async ({ demo }) => {
  const { page } = demo;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const origin = page.locator(".sidebar section.remote-sub").filter({ hasText: "origin" });
  const menu = async (item: string | RegExp) => {
    await origin.getByRole("button", { name: "origin 메뉴" }).click();
    await page.locator(".context-menu").getByRole("menuitem", { name: item }).click();
  };
  await menu("URL 복사");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://github.com/ddugit/ddugit-demo.git");

  await menu("origin만 가져오기 (Fetch)");
  await demo.toast("origin에서 브랜치 4개를 가져왔어요");

  await menu("origin에 올리기 막기 (가져오기 전용)");
  await demo.toast("origin은 이제 가져오기 전용이에요");
  await expect(origin.locator(".fetch-only")).toBeVisible();
  expect((await demo.snapshot()).remotes).toEqual([
    { name: "origin", url: "https://github.com/ddugit/ddugit-demo.git", push: false },
  ]);
  // Push now asks to go elsewhere instead.
  await page.locator(".topbar").getByRole("button", { name: /Push/ }).click();
  await expect(page.locator(".dialog.sync-confirm")).toContainText("가져오기 전용 원격이라 올리지 않아요");
  await page.keyboard.press("Escape");

  await menu("origin에 올리기 허용");
  await demo.toast("origin에 올릴 수 있어요");
  await expect(origin.locator(".fetch-only")).toHaveCount(0);
  expect((await demo.snapshot()).remotes[0].push).toBe(true);
});

test("deletes a branch on its remote from the remote branch's menu, keeping the local one", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const target = before.refs.find((r) => r.kind === "remote" && r.name === "origin/feature/theme")!;
  expect(target).toBeTruthy();
  await page.click(".sidebar li >> text=feature/theme >> nth=1", { button: "right" });
  await page.getByRole("menuitem", { name: "origin에서 삭제…" }).click();
  const dialog = page.getByRole("dialog", { name: "원격 브랜치 삭제" });
  await expect(dialog).toContainText("feature/theme");
  await dialog.getByRole("button", { name: "삭제" }).click();
  await expect
    .poll(async () => (await demo.snapshot()).refs.some((r) => r.name === "origin/feature/theme"))
    .toBe(false);
  await demo.toast(/원격에서 origin\/feature\/theme/);
  const snap = await demo.snapshot();
  expect(snap.refs.some((r) => r.kind === "remote" && r.name === "origin/feature/theme")).toBe(false);
  expect(snap.refs.some((r) => r.kind === "local" && r.name === "feature/theme")).toBe(true);
});

test("pushes tags to a remote and deletes one there, keeping the local tag", async ({ demo }) => {
  const { page } = demo;
  const remoteTags = () => page.evaluate(() => window.__ddugitDemo.remoteTags());
  const tags = page.locator(".sidebar section", { has: page.locator("h3", { hasText: "태그" }) });
  const tagMenu = async (tag: string, item: string) => {
    await tags.locator("li", { hasText: tag }).click({ button: "right" });
    await page.locator(".context-menu").getByRole("menuitem", { name: item }).click();
  };

  // A new tag goes up right away when asked.
  const head = (await demo.snapshot()).head.target!;
  await (await demo.commitMenu(head)).getByText("여기에 태그…").click();
  const dialog = page.getByRole("dialog", { name: `${head.slice(0, 7)}에 태그` });
  await dialog.getByPlaceholder("v1.0.0").fill("v0.3.0");
  await dialog.getByRole("checkbox", { name: "만든 뒤 origin에 바로 올리기 (Push)" }).check();
  await dialog.getByRole("button", { name: "태그 만들기" }).click();
  await demo.toast("v0.3.0 태그를 origin에 올렸어요");
  expect(await remoteTags()).toContain("origin/v0.3.0");

  await tagMenu("v0.2.0", "origin에서 삭제…");
  const confirm = page.getByRole("dialog", { name: "원격 태그 삭제" });
  await expect(confirm).toContainText("origin의 태그 v0.2.0");
  await confirm.getByRole("button", { name: "삭제" }).click();
  await demo.toast("origin에서 v0.2.0 태그를 지웠어요");
  expect(await remoteTags()).not.toContain("origin/v0.2.0");
  expect((await demo.snapshot()).refs.some((r) => r.kind === "tag" && r.name === "v0.2.0")).toBe(true);

  // "Push all tags" from the remote's menu brings it back; missing sign-in opens the help first.
  await demo.mutateQuietly((d) => (d.failNextRemote = "https"));
  const origin = page.locator(".sidebar section.remote-sub").filter({ hasText: "origin" });
  const pushAll = async () => {
    await origin.getByRole("button", { name: "origin 메뉴" }).click();
    await page.locator(".context-menu").getByRole("menuitem", { name: "모든 태그 올리기 (Push)" }).click();
  };
  await pushAll();
  await expect(page.locator(".dialog.auth")).toBeVisible();
  await page.keyboard.press("Escape");
  await pushAll();
  await demo.toast("origin에 모든 태그를 올렸어요");
  expect((await remoteTags()).sort()).toEqual(["origin/v0.1.0", "origin/v0.2.0", "origin/v0.3.0"]);

  await tagMenu("v0.1.0", "origin에 올리기 (Push)");
  await demo.toast("v0.1.0 태그를 origin에 올렸어요");
});
