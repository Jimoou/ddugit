// Getting repositories in: clone, SSH, init, tabs, and the galaxy dashboard with its groups and batch work.

import { demoFlags, expect, test } from "./fixtures";

test("clones from a URL, remembers it in the repository menu and stars it", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => (window.__ddugitDemo.nextFolder = "/work"));
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByPlaceholder("https://github.com/owner/repo.git").fill("https://github.com/acme/rocket.git");
  await dialog.getByRole("button", { name: "고르기…" }).click();
  await expect(dialog).toContainText("→ /work/rocket");
  await dialog.getByRole("button", { name: "복제" }).click();
  await demo.toast("rocket을 복제했어요");

  await page.locator(".tab.on .tab-menu").click();
  const row = page.locator(".repo-menu .recent-list li").filter({ hasText: "/work/rocket" });
  await expect(row).toHaveClass(/on/);
  await row.getByRole("button", { name: "즐겨찾기", exact: true }).click();
  await expect(row.locator(".star")).toHaveAttribute("aria-pressed", "true");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.recent")!));
  expect(stored[0]).toMatchObject({ path: "/work/rocket", starred: true });
});

test("sets up SSH for a clone inside the app: key, host trust, test", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  const url = dialog.getByPlaceholder("https://github.com/owner/repo.git");
  await url.fill("https://github.com/acme/rocket.git");
  await dialog.getByRole("radio", { name: "SSH" }).click();
  await expect(dialog.locator("input.text").first()).toHaveValue("git@github.com:acme/rocket.git");

  await dialog.locator(".ssh-ready summary").click();
  const ssh = dialog.locator(".ssh-setup");
  await ssh.getByRole("button", { name: "키 만들기" }).click();
  await expect(ssh).toContainText("~/.ssh/id_ed25519");
  await expect(ssh.getByRole("button", { name: /공개키 복사/ })).toBeVisible();
  await ssh.getByRole("button", { name: "서버 확인" }).click();
  await expect(ssh).toContainText("github.com에서 공개한 지문과 일치해요");
  await ssh.getByRole("button", { name: "이 서버 신뢰" }).click();
  await expect(ssh).toContainText("이미 신뢰한 서버예요");
  await ssh.getByRole("button", { name: "연결 확인" }).click();
  await expect(ssh).toContainText("demo로 인증됐어요");

  // Back to HTTPS: the same repository.
  await dialog.getByRole("radio", { name: "HTTPS" }).click();
  await expect(dialog.locator("input.text").first()).toHaveValue("https://github.com/acme/rocket.git");
});

test("clones one of my GitHub repositories by searching for it", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => (window.__ddugitDemo.nextFolder = "/work"));
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByRole("tab", { name: "GitHub" }).click();
  const list = dialog.getByRole("listbox", { name: "GitHub 저장소" });
  await expect(list.getByRole("option")).toHaveCount(8);
  await expect(dialog).toContainText("github.com에 stella로 로그인돼 있어요");

  await dialog.getByPlaceholder("내 저장소 검색").fill("tele");
  await expect(list.getByRole("option")).toHaveCount(1);
  const row = list.getByRole("option", { name: /orbit-labs\/telemetry/ });
  await expect(row).toContainText("비공개");
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("radio", { name: "SSH" }).click();
  await dialog.getByRole("button", { name: "고르기…" }).click();
  await expect(dialog).toContainText("→ /work/telemetry");
  await dialog.getByRole("button", { name: "복제", exact: true }).click();
  await demo.toast("telemetry를 복제했어요");
  // The source and the protocol are remembered for next time.
  expect(
    await page.evaluate(() => [localStorage.getItem("ddugit.cloneSource"), localStorage.getItem("ddugit.forgeProto")]),
  ).toEqual(["github", "ssh"]);
});

test("a self-managed GitLab asks to connect before listing repositories", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByRole("tab", { name: "GitLab" }).click();
  const host = dialog.getByLabel("서버", { exact: true });
  await expect(host).toHaveValue("gitlab.com");
  await host.fill("https://gitlab.corp.example/");
  await host.press("Enter");
  await expect(dialog.locator(".forge-connect")).toContainText("GitLab에 연결하면 내 저장소를 바로 고를 수 있어요");
  await dialog.getByRole("button", { name: "GitLab 연결" }).click();

  const token = page.getByRole("dialog", { name: "GitLab 연결" });
  await expect(token).toContainText("gitlab.corp.example");
  await token.getByLabel("토큰").fill("glpat-demo");
  await token.getByRole("button", { name: "연결", exact: true }).click();
  await expect(token).toHaveCount(0);
  // The clone dialog stays open and lists the projects on that host.
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(8);
  await expect(dialog.getByRole("option").first()).toHaveAttribute(
    "title",
    "https://gitlab.corp.example/stella/ddugit-demo.git",
  );
});

test("creates a new repository in a plain folder", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => (window.__ddugitDemo.nextFolder = "/tmp/not-a-repo"));
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /새 저장소 만들기/ })
    .click();
  await demo.toast("새 저장소를 만들었어요");
  await page.locator(".tab.on .tab-menu").click();
  await expect(page.locator(".repo-menu .recent-list li.on")).toContainText("/tmp/not-a-repo");
});

test("opens repositories in tabs and keeps each tab's state", async ({ demo }) => {
  const { page } = demo;
  const tabs = page.locator(".tabbar .tab:not(.tab-home)");
  await expect(tabs).toHaveCount(1);

  // Select a commit in the first tab so we can see it survive a switch.
  const snap = await demo.snapshot();
  const head = snap.head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(".inspector")).toBeVisible();

  await page.locator(".tab-new").click();
  await expect(tabs).toHaveCount(2);
  await expect(page.locator(".welcome")).toContainText("최근 저장소");
  await page.evaluate(() => (window.__ddugitDemo.nextFolder = "/work/second"));
  await page
    .locator(".welcome")
    .getByRole("button", { name: /폴더 열기/ })
    .click();
  await expect(tabs.nth(1)).toContainText("second");
  await expect(page.locator(".app:not([hidden]) .inspector")).toHaveCount(0);

  await tabs.nth(0).click();
  await expect(page.locator(".app:not([hidden]) .inspector")).toBeVisible();

  await tabs.nth(1).getByRole("button", { name: /닫기/ }).click();
  await expect(tabs).toHaveCount(1);
});

test("the galaxy dashboard reads every recent repository and fetches them all", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    const paths = ["/work/rocket", "/work/gone-project", "/srv/api-server"];
    localStorage.setItem("ddugit.recent", JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: i }))));
  });
  await page.reload();
  // The home tab shows the galaxy over the open repository, without a new tab.
  await page.locator(".tab-home").click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(1);
  const galaxy = page.locator(".welcome .galaxy");
  await expect(galaxy).toContainText("내 저장소 · 3개");
  const worlds = galaxy.locator(".world");
  await expect(worlds).toHaveCount(3);
  await expect(worlds.filter({ hasText: "gone-project" })).toContainText("찾을 수 없음");
  await expect(worlds.filter({ hasText: "rocket" }).locator(".world-branch")).toContainText("origin/");

  // Fetch reaches the two readable ones.
  await galaxy.getByRole("button", { name: /모두 Fetch/ }).click();
  await demo.toast("저장소 2개에서 새 커밋을 가져왔어요");
  await expect(galaxy.locator(".world-fetch.ok")).toHaveCount(2);

  // Forget the missing one, then open a world: it gets its own tab beside the demo.
  await worlds.filter({ hasText: "gone-project" }).getByRole("button", { name: "목록에서 지우기" }).click();
  await expect(worlds).toHaveCount(2);
  await worlds.filter({ hasText: "api-server" }).locator(".world-open").click();
  await expect(page.locator(".app:not([hidden]) .topbar")).toBeVisible();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);
});

test("groups repositories on the dashboard: create, move in, open all, ungroup", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    const paths = ["/work/api-gateway", "/work/payments", "/home/me/dotfiles"];
    localStorage.setItem(
      "ddugit.recent",
      JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: 9 - i }))),
    );
  });
  await page.reload();
  await page.locator(".tab-new").click();
  const galaxy = page.locator(".welcome .galaxy");
  await expect(galaxy.locator(".band")).toHaveCount(0);

  await galaxy.getByRole("button", { name: "그룹", exact: true }).click();
  await page.locator(".dialog input.text").fill("결제 플랫폼");
  await page.locator(".dialog").getByRole("button", { name: "만들기" }).click();
  const band = galaxy.locator(".band").filter({ hasText: "결제 플랫폼" });
  await expect(band).toContainText("아직 비어 있어요");

  for (const name of ["api-gateway", "payments"]) {
    await galaxy.locator(".world").filter({ hasText: name }).getByRole("button", { name: "그룹으로 옮기기" }).click();
    await page.getByRole("menuitem", { name: "결제 플랫폼으로 옮기기" }).click();
  }
  await expect(band.locator(".world")).toHaveCount(2);
  await expect(galaxy.locator(".band.ungrouped .world")).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.recent")!));
  expect(stored.filter((r: { group?: string }) => r.group).length).toBe(2);

  // Fold and unfold, then open the whole group as tabs.
  await band.locator(".fold").click();
  await expect(band.locator(".world")).toHaveCount(0);
  await band.locator(".fold").click();
  await band.getByRole("button", { name: "모두 열기" }).click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(3);

  // Ungrouping keeps the repositories.
  await page.locator(".tabbar .tab-new").click();
  await galaxy
    .locator(".band")
    .filter({ hasText: "결제 플랫폼" })
    .getByRole("button", { name: "결제 플랫폼 메뉴" })
    .click();
  await page.getByRole("menuitem", { name: /그룹 해제/ }).click();
  await expect(galaxy.locator(".band")).toHaveCount(0);
  await expect(galaxy.locator(".world")).toHaveCount(3);
});

test("groups: a suggestion by owner, picking several cards, and dragging between bands", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    const paths = ["/work/acme-main", "/work/acme-patches", "/home/me/dotfiles", "/srv/tools/lint"];
    localStorage.setItem(
      "ddugit.recent",
      JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: 9 - i }))),
    );
  });
  await page.reload();
  await page.locator(".tab-new").click();
  const galaxy = page.locator(".welcome .galaxy");

  // The two acme repositories are offered as a group.
  await expect(galaxy.locator(".group-hint")).toContainText("acme 저장소 2개를 한 그룹으로 묶을까요?");
  await galaxy.locator(".group-hint").getByRole("button", { name: "묶기" }).click();
  const acme = galaxy.locator(".band").filter({ hasText: "acme" }).first();
  await expect(acme.locator(".world")).toHaveCount(2);
  await expect(galaxy.locator(".group-hint")).toHaveCount(0);

  // Ctrl+click picks cards instead of opening them; the bar moves them together.
  for (const name of ["dotfiles", "lint"])
    await galaxy
      .locator(".world")
      .filter({ hasText: name })
      .locator(".world-open")
      .click({ modifiers: ["Control"] });
  await expect(galaxy.locator(".pick-bar")).toContainText("2개 선택");
  await galaxy.locator(".pick-bar").getByRole("button", { name: "acme로 옮기기" }).click();
  await expect(acme.locator(".world")).toHaveCount(4);
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);

  // Drag a card out to the (now empty) ungrouped band.
  const loose = galaxy.locator(".band.ungrouped");
  await expect(loose).toContainText("그룹에 넣지 않은 저장소");
  await galaxy.locator(".world").filter({ hasText: "lint" }).dragTo(loose);
  await expect(acme.locator(".world")).toHaveCount(3);
  await expect(loose.locator(".world")).toHaveCount(1);
});

test("groups show in the repository menu, and grouped tabs carry the group's colour", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    localStorage.setItem("ddugit.groups", JSON.stringify([{ id: "pay", name: "결제 플랫폼", hue: 190 }]));
    const recent = [
      { path: "/work/api-gateway", group: "pay" },
      { path: "/work/payments", group: "pay" },
      { path: "/home/me/dotfiles" },
    ];
    localStorage.setItem("ddugit.recent", JSON.stringify(recent.map((r, i) => ({ ...r, starred: false, at: 9 - i }))));
  });
  await page.reload();
  await page.locator(".tab.on .tab-menu").click();
  const menu = page.locator(".repo-menu");
  const group = menu.locator(".recent-groups section").filter({ hasText: "결제 플랫폼" });
  await expect(group.locator(".recent-list li")).toHaveCount(2);
  await expect(menu.locator(".recent-groups section").filter({ hasText: "미분류" })).toContainText("dotfiles");
  await group.getByRole("button", { name: "모두 열기" }).click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(3);
  await expect(page.locator(".tabbar .tab.grouped")).toHaveCount(2);
  await expect(page.locator(".tabbar .tab.grouped").first()).toHaveAttribute("title", /^결제 플랫폼 · /);
});

test("the dashboard pulls picked repositories and puts them all on the same branch", async ({ demo }) => {
  const { page } = demo;
  // nova is behind its upstream, comet has diverged, rocket is stopped mid-merge.
  const names = ["nova", "comet", "rocket"];
  await page.evaluate((names) => {
    const recent = names.map((n, i) => ({ path: `/work/${n}`, starred: false, at: i }));
    localStorage.setItem("ddugit.recent", JSON.stringify(recent));
  }, names);
  await page.reload();
  await page.locator(".tab-home").click();
  const galaxy = page.locator(".welcome .galaxy");
  const world = (name: string) => galaxy.locator(".world").filter({ hasText: `/work/${name}` });
  for (const name of names)
    await world(name)
      .locator(".world-open")
      .click({ modifiers: ["ControlOrMeta"] });
  const bar = galaxy.locator(".pick-bar");
  await expect(bar).toContainText("3개");

  // Pull fast-forwards what it can; the diverged one is marked, the stopped one left out.
  await bar.getByRole("button", { name: /Pull/ }).click();
  await demo.toast("1개는 Pull했고 1개는 못 했어요. 카드에 표시했어요");
  await expect(world("nova").locator(".world-fetch")).toHaveClass(/ok/);
  await expect(world("comet").locator(".world-fetch")).toContainText("갈라짐");
  await expect(world("rocket").locator(".world-fetch")).toHaveCount(0);

  await bar.getByRole("button", { name: /브랜치…/ }).click();
  await page.locator(".dialog input.text").fill("release/3.0");
  await page.keyboard.press("Enter");
  await demo.toast("저장소 2개를 release/3.0으로 전환했어요");
  for (const name of ["nova", "comet"]) await expect(world(name).locator(".world-branch")).toContainText("release/3.0");
  await expect(world("rocket").locator(".world-branch")).not.toContainText("release/3.0");
});

test("on Free, batch pull and branch switching offer Pro", async ({ demo }) => {
  const { page } = demo;
  await demoFlags(page, { Pro: { pro: false, source: "free" } });
  await page.addInitScript(() => {
    localStorage.setItem("ddugit.recent", JSON.stringify([{ path: "/work/nova", starred: false, at: 0 }]));
  });
  await page.reload();
  await page.locator(".tab-home").click();
  await page.locator(".welcome .galaxy .world .world-open").click({ modifiers: ["ControlOrMeta"] });
  await page
    .locator(".pick-bar")
    .getByRole("button", { name: /브랜치…/ })
    .click();
  await expect(page.locator(".dialog.pro-offer")).toContainText("여러 저장소");
});
