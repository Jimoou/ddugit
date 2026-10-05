# Big-repository performance

How ddugit was measured on a large history before v1.0, what changed, and how to measure again.

## Test repository

`scripts/perf/gen.py` streams a synthetic history into `git fast-import` (about a minute):

- 100,000 commits, 6,023 merges: `main`, `develop`, three release lines, 1,800 feature branches off `develop`
  merged back (most then deleted), `develop` merged into `main`
- 298 local branches, 5 remote branches, 300 tags (603 refs), 27 lanes when fully laid out
- one commit adding a 50,000-line file, one commit touching 5,000 files

```bash
git init -b main big && cd big
python3 ../scripts/perf/gen.py 100000 | git fast-import --quiet && git checkout -q main
```

## Method

**Rust** (release build, `#[ignore]`d bench tests that print timings and can dump their output as JSON):

```bash
cd src-tauri
DDUGIT_BENCH_REPO=<big> DDUGIT_BENCH_OUT=<dir> \
DDUGIT_BENCH_DIFFS=$(git -C <big> log --all --format=%H --grep=50k -1),$(git -C <big> log --all --format=%H --grep='touch 5k' -1) \
cargo test --release --lib _bench -- --ignored --nocapture --test-threads=1
```

- `git::read::tests::snapshot_bench`: `snapshot()` at 1,000 / 3,000 / 10,000 (the page sizes in the settings) and
  100,000 commits, best of 3, and the parts of one read
- `git::diff::tests::diff_bench`: `commit_diff()` of the two big commits

**Web** (`scripts/perf/bench.mjs`, Playwright's Chromium against the demo, which can take a real snapshot through
`window.__ddugitDemo.loadHistory()` and serve fixed diffs through `window.__ddugitDemo.diffs`):

```bash
npx vite --port 1431 --strictPort &
TAG=after PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/perf/bench.mjs <dir> [pure] [ui] [diff]
```

- `pure`: the graph modules on the first _n_ commits of the 100k snapshot, in the page (median of 5): `computeLayout`,
  `buildScene`, `straightRuns` + `runIndex`, and one `draw()` into an `OffscreenCanvas` centred mid-history at 100 %,
  at the smallest zoom (runs folded) and at the smallest zoom with a search lighting every third commit (nothing folds)
- `ui`: loading a 10,000-commit page and "load more" to 30,000 (long tasks), JS heap, frame intervals while panning,
  selecting a commit
- `diff`: opening each big commit in the inspector, then its first file in the diff sheet; long tasks and DOM size

The sandbox draws with a software rasterizer: a frame interval is 50–100 ms even on the 40-commit demo, so the panning
numbers say nothing about drawing cost. The `draw()` column does. The demo runs React's development build and its mock
backend works out reachability and ahead/behind over all 100k commits on every read (about 400 ms), so `ui` long tasks
are inflated alike before and after.

## Results

Same machine (4 cores, shared with other jobs: ±20 %). Before: `main` at `feac12a`.

### Rust: `snapshot()` on the 100k repository

| commits read    | before   | after    |
| --------------- | -------- | -------- |
| 1,000           | 1,239 ms | 41 ms    |
| 3,000 (default) | 1,431 ms | 72 ms    |
| 10,000          | 1,344 ms | 202 ms   |
| 100,000 (all)   | 1,769 ms | 2,018 ms |

Nearly all of it was the revwalk: libgit2's `TOPOLOGICAL | TIME` sort reads the whole history before it yields
the first commit. Refs, HEAD, status and stashes take under 10 ms together.

### Web: graph pipeline (ms)

| commits | `computeLayout` | `buildScene` | runs     | `draw()` 100 % / min / min + search |
| ------- | --------------- | ------------ | -------- | ----------------------------------- |
| 3,000   | 11 → 8          | 34 → 0.9     | 4 → 1    | 1.6 / 1.2 / 2.0 → 2.1 / 2.1 / 1.6   |
| 10,000  | 16 → 11         | 56 → 1.6     | 13 → 3   | 2.0 / 2.0 / 4.5 → 1.3 / 1.3 / 1.5   |
| 50,000  | 159 → 55        | 390 → 4.5    | 81 → 10  | 3.8 / 3.4 / 6.0 → 1.3 / 1.2 / 1.4   |
| 100,000 | 349 → 120       | 838 → 7      | 257 → 23 | 3.2 / 3.2 / 7.0 → 1.0 / 1.0 / 1.2   |

On the same input the new `computeLayout` returns exactly the old layout (checked node by node at 3k and 100k), and
`straightRuns` the old runs.

### Web: in the demo

| step                                         | before                     | after                |
| -------------------------------------------- | -------------------------- | -------------------- |
| load a 10k page: long tasks total / longest  | 1,782 / 549 ms             | 1,171 / 461 ms       |
| load more to 30k: long tasks total / longest | 2,246 / 994 ms             | 1,806 / 1,056 ms     |
| JS heap with 30k commits                     | 128 MB                     | 92 MB                |
| select a commit (30k): longest task          | 411 ms                     | 173 ms               |
| 50k-line file: rows shown                    | 3,000 (cut by the backend) | 50,000               |
| 50k-line file: open the sheet, long tasks    | 2,065 ms (longest 1,017)   | 372 ms (longest 134) |
| 50k-line file: DOM nodes                     | 15,396                     | 635                  |
| 5k-file commit: inspector, longest task      | 1,206 ms                   | 87 ms                |
| 5k-file commit: open the sheet, long tasks   | 4,097 ms (longest 3,091)   | 480 ms (longest 141) |
| 5k-file commit: DOM nodes                    | 65,482                     | 954                  |

What is left in the demo's load is the mock backend and React's development build (the sidebar's 600 ref rows were
300 ms of each re-render there; they now re-render only when their ref changes).

## What changed

- **History read** (`git/read.rs`): walks newest first by commit time itself (`TimeWalk`, a heap) and stops at the
  page size, then `children_first` restores children-before-parents inside the page (a skewed clock can put a parent
  ahead of its child). The order is `git log --date-order`'s instead of libgit2's topological one.
- **Layout** (`graph/layout.ts`): rows instead of ids inside the loop (one `Map`, lanes hold row numbers, the next
  row is checked before hashing a parent id), edges made once.
- **Scene** (`graph/scene.ts`): only bounding boxes and a row-bucket index (`edgesInRows`) up front; an edge's
  `Path2D` and samples are made the first time it is drawn (`shapeOf`). Hit testing reads `layout.nodes[row]`
  (`nodeAtCell`) instead of a `row:lane` string map. Sparkles on long edges are computed only for the part on screen
  (`fractionAtX`, `sparklesIn`).
- **Renderer**: visible edges from the row index instead of filtering every edge each frame, folded runs by binary
  search (`runsInRows`). The minimap's static layer strokes one path per colour.
- **Runs** (`graph/runs.ts`): counted in typed arrays by row.
- **Selection**: "contained in" branches come from one pass over the newer rows (`descendantsOf`) instead of every
  branch tip's ancestry.
- **Diff sheet and changed files**: rows have fixed heights, and lists over 400 rows draw only the rows near the
  viewport (`components/virtual.ts`). The backend now sends up to 50,000 lines per file and 100,000 per diff (was
  3,000 / 20,000).
- **Sidebar**: ref rows are memoized.

## Not done

- **Layout in a Web Worker.** With the above, laying out the biggest page (10,000) takes about 11 ms and 100,000
  loaded commits about 120 ms. A worker would still have to clone the ids and parents in and build the node objects
  and the `byId` map back on the main thread, which is most of that time, and it would make the layout trail the
  snapshot by a frame. Worth it only if layout must stay off the main thread for 100k+ histories.
- **WebGL renderer.** `draw()` stays at 1–2 ms of script at any history size, since only what is on screen is drawn.
- Reading 100k commits at once still takes about 2 s in Rust and 25 MB of JSON; pages (`load more`) keep that rare.
