// Web side of the big-repository benchmark (docs/PERF.md), against the demo:
//   npx vite --port 1431 --strictPort
//   node scripts/perf/bench.mjs <dir> [pure|ui|diff ...]
// <dir> holds what the Rust benches wrote (snapshot-100000.json, diff-0.json,
// diff-1.json); results go to <dir>/web-$TAG.json. PW_CHROMIUM picks a browser.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const dir = process.argv[2];
const only = process.argv.slice(3);
const want = (s) => !only.length || only.includes(s);
const BASE = process.env.BASE ?? "http://localhost:1431";
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.route("**/__perf/*", (route) =>
  route.fulfill({ path: `${dir}/${route.request().url().split("/__perf/")[1]}`, contentType: "application/json" }),
);
await page.addInitScript(() => {
  localStorage.setItem("ddugit.voyage", JSON.stringify({ done: [], dismissed: true }));
  window.__longTasks = [];
  new PerformanceObserver((l) => window.__longTasks.push(...l.getEntries().map((e) => e.duration))).observe({
    type: "longtask",
    buffered: true,
  });
});
await page.goto(BASE);
await page.waitForSelector(".topbar");
const out = {};

if (want("pure")) {
  out.pure = await page.evaluate(async () => {
    const L = await import("/src/graph/layout.ts");
    const S = await import("/src/graph/scene.ts");
    const R = await import("/src/graph/runs.ts");
    const snap = await (await fetch("/__perf/snapshot-100000.json")).json();
    const time = (f, reps = 5) => {
      const ts = [];
      let v;
      for (let i = 0; i < reps; i++) {
        const t0 = performance.now();
        v = f();
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      return [ts[reps >> 1], v];
    };
    const rows = [];
    for (const n of [3000, 10000, 50000, 100000]) {
      const commits = snap.commits.slice(0, n);
      const [layoutMs, layout] = time(() => L.computeLayout(commits, snap.refs, snap.head));
      const [sceneMs, scene] = time(() => S.buildScene(layout));
      const refsAt = new Set(snap.refs.map((r) => r.target));
      const [runsMs] = time(() => R.runIndex(R.straightRuns(layout, (id) => refsAt.has(id))));
      // One frame drawn off screen at a few zooms, centred mid-history (median of 15).
      const D = await import("/src/graph/renderer.ts");
      const cv = new OffscreenCanvas(1180, 700);
      const ctx = cv.getContext("2d");
      const refsBy = new Map();
      for (const r of snap.refs) refsBy.set(r.target, [...(refsBy.get(r.target) ?? []), r]);
      const runs = R.straightRuns(layout, (id) => refsAt.has(id));
      const runOf = R.runIndex(runs);
      const summaries = new Map(commits.map((c) => [c.id, c.summary]));
      const mid = { x: S.xOf(layout.rowCount >> 1, layout.rowCount), y: 4 * S.LANE };
      const drawAt = (k, focus) => {
        const st = {
          scene,
          view: D.viewAt(mid, { x: 590, y: 350 }, k, 0),
          w: 1180,
          h: 700,
          dpr: 1,
          time: 1,
          animate: true,
          space: true,
          glow: true,
          headId: snap.head.target,
          headBranch: snap.head.branch,
          plus: { x: 0, y: 0 },
          plusHover: false,
          changeCount: 0,
          selected: null,
          hovered: null,
          focus,
          refs: refsBy,
          summaries,
          drag: null,
          births: new Map(),
          stashes: [],
          stashHover: null,
          stashSelected: null,
          labelHits: [],
          incoming: null,
          badges: new Map(),
          trail: [],
          truncated: true,
          moreHit: { rect: null },
          runs,
          runOf,
          runHover: null,
        };
        return time(() => D.draw(ctx, st), 15)[0];
      };
      const draw1 = drawAt(1, null);
      const drawMin = drawAt(0.08, null);
      const third = new Set(commits.filter((_, i) => i % 3 === 0).map((c) => c.id));
      const drawMinSearch = drawAt(0.08, third);
      // Zoomed out to where branch names and brief summaries still show (`ZOOM.briefs`).
      const drawBrief = drawAt(0.3, null);
      const drawBriefSearch = drawAt(0.3, third);
      rows.push({
        n,
        draw1,
        drawMin,
        drawMinSearch,
        drawBrief,
        drawBriefSearch,
        lanes: layout.laneCount,
        edges: layout.edges.length,
        layoutMs,
        sceneMs,
        runsMs,
      });
    }
    return rows;
  });
  console.table(out.pure);
}

/** Frame intervals while `step(i)` runs once per frame for `ms`. */
async function frames(label, step, ms = 2500) {
  const r = await page.evaluate(
    async ([src, ms]) => {
      const step = eval(src);
      const ds = [];
      let last = performance.now();
      const t0 = last;
      let i = 0;
      await new Promise((done) => {
        const tick = (now) => {
          ds.push(now - last);
          last = now;
          step(i++);
          if (now - t0 < ms) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      ds.shift();
      ds.sort((a, b) => a - b);
      const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
      return { avg: +avg.toFixed(1), p95: +ds[Math.floor(ds.length * 0.95)].toFixed(1), max: +ds.at(-1).toFixed(1) };
    },
    [step.toString(), ms],
  );
  console.log(`  ${label}: avg ${r.avg} ms, p95 ${r.p95} ms, max ${r.max} ms`);
  return r;
}

const longTasks = () =>
  page.evaluate(() => {
    const l = window.__longTasks.splice(0);
    return { total: Math.round(l.reduce((a, b) => a + b, 0)), max: Math.round(Math.max(0, ...l)) };
  });

/** Fly to a commit and wait for the camera to settle; its page position. */
async function settleOn(id, zoom = 1) {
  await page.evaluate(([id, zoom]) => window.__ddugit.centerOn(id, zoom), [id, zoom]);
  let prev = null;
  for (;;) {
    await page.waitForTimeout(400);
    const at = await page.evaluate((id) => window.__ddugit.screenOf(id), id);
    if (prev && Math.abs(prev.x - at.x) < 0.5 && Math.abs(prev.y - at.y) < 0.5) return at;
    prev = at;
  }
}

const canvas = ".app:not([hidden]) .graph canvas";
const wheel = (opts) =>
  `(i) => document.querySelector('${canvas}').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 700, clientY: 300, ...${JSON.stringify(opts)} }))`;

async function loadHistory(limit) {
  // The demo repository becomes the big one; a page of `limit` commits is read on refresh.
  await page.evaluate(
    async ([limit]) => {
      const snap = await (await fetch("/__perf/snapshot-100000.json")).json();
      window.__ddugitDemo.loadHistory(snap);
      window.__perfOldest = snap.commits[Math.min(limit, snap.commits.length) - 1].id;
    },
    [limit],
  );
  await longTasks();
  const t0 = Date.now();
  await page.keyboard.press("F5");
  await page.waitForFunction((id) => !!window.__ddugit?.screenOf(id), await page.evaluate(() => window.__perfOldest));
  const lt = await longTasks();
  const wall = Date.now() - t0;
  return { wall, ...lt };
}

if (want("ui")) {
  out.ui = {};
  // Biggest page in the settings: 10 000 commits per read.
  await page.evaluate(() => {
    localStorage.setItem("ddugit.settings", JSON.stringify({ historyPage: 10000 }));
  });
  await page.reload();
  await page.waitForSelector(".topbar");
  await page.mouse.move(5, 5);
  for (const pages of [1, 3]) {
    const limit = pages * 10000;
    let load;
    if (pages === 1) load = await loadHistory(limit);
    else {
      // "Load more" twice: the pill left of the oldest commit.
      for (let p = 1; p < pages; p++) {
        const id = await page.evaluate((n) => window.__ddugitDemo.snapshot().commits[n - 1].id, p * 10000);
        const at = await settleOn(id);
        await longTasks();
        const t0 = Date.now();
        await page.mouse.click(at.x - 84 * 1.6, at.y);
        const next = await page.evaluate((n) => window.__ddugitDemo.snapshot().commits[n - 1]?.id, (p + 1) * 10000);
        await page.waitForFunction((id) => !!window.__ddugit?.screenOf(id), next, { timeout: 120000 });
        load = { wall: Date.now() - t0, ...(await longTasks()) };
      }
    }
    console.log(
      `UI with ${limit} commits: load wall ${load.wall} ms, long tasks total ${load.total} ms, max ${load.max} ms`,
    );
    const heap = await page.evaluate(() => {
      globalThis.gc?.();
      return Math.round(performance.memory.usedJSHeapSize / 1e6);
    });
    console.log(`  JS heap ${heap} MB`);
    const head = await page.evaluate(() => window.__ddugitDemo.snapshot().head.target);
    await settleOn(head);
    const pan = await frames("pan at 100%", wheel({ deltaX: 25 }));
    // Zoom all the way out (folded runs), then pan.
    await frames("zoom out", wheel({ deltaY: 60, ctrlKey: true }), 1500);
    const panOut = await frames("pan at min zoom", wheel({ deltaX: 25 }));
    // Search lights single commits, so nothing folds: the worst case for drawing.
    await page.keyboard.press("Control+f");
    await page.keyboard.type("change");
    await page.waitForTimeout(1500);
    const panSearch = await frames("pan at min zoom, searching", wheel({ deltaX: 25 }));
    await page.keyboard.press("Escape");
    await page.mouse.move(5, 5);
    // Select HEAD: the inspector lists the branches that contain it.
    const at = await settleOn(head);
    await longTasks();
    const t1 = Date.now();
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector(".inspector");
    await page.waitForTimeout(300);
    const select = { wall: Date.now() - t1, ...(await longTasks()) };
    console.log(`  select a commit: wall ${select.wall} ms, long tasks max ${select.max} ms`);
    await page.keyboard.press("Escape");
    out.ui[limit] = { load, heap, pan, panOut, panSearch, select };
  }
}

if (want("diff")) {
  out.diff = {};
  await page.reload();
  await page.waitForSelector(".topbar");
  for (const [ci, name, file] of [
    [0, "50k-line file", "diff-0.json"],
    [1, "5k files", "diff-1.json"],
  ]) {
    if (!fs.existsSync(`${dir}/${file}`)) continue;
    await page.evaluate(async (file) => {
      window.__ddugitDemo.diffs = await (await fetch(`/__perf/${file}`)).json();
    }, file);
    // A different commit each time: the inspector keeps a commit's files.
    const head = await page.evaluate((ci) => window.__ddugitDemo.snapshot().commits[ci].id, ci);
    const at = await settleOn(head);
    await longTasks();
    let t0 = Date.now();
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector(".inspector .changed li:not(.dir)");
    const inspector = { wall: Date.now() - t0, ...(await longTasks()) };
    t0 = Date.now();
    await page.locator(".inspector .changed li:not(.dir)").first().click();
    await page.waitForSelector(".diff-sheet table.diff");
    await page.waitForTimeout(200);
    const sheet = { wall: Date.now() - t0, ...(await longTasks()) };
    const dom = await page.evaluate(() => document.querySelectorAll("*").length);
    // Scroll the diff through.
    const scroll = await frames("scroll diff", "(i) => document.querySelector('.diff-body').scrollTop += 400", 1500);
    console.log(
      `${name}: inspector wall ${inspector.wall} ms (long max ${inspector.max}), sheet wall ${sheet.wall} ms (long total ${sheet.total}, max ${sheet.max}), DOM nodes ${dom}`,
    );
    out.diff[name] = { inspector, sheet, dom, scroll };
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

fs.writeFileSync(`${dir}/web-${process.env.TAG ?? "run"}.json`, JSON.stringify(out, null, 2));
await browser.close();
