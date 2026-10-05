#!/usr/bin/env python3
"""Synthetic big repository for ddugit perf checks, streamed into `git fast-import`.

~100k commits: main + develop + 3 release lines, feature branches off develop
merged back often (most then deleted), develop merged into main: ~6k merges,
~300 branches, 300 tags.
Also one commit changing a 50k-line file and one commit touching 5k files.
Usage: gen.py N | git fast-import --quiet
"""
import random
import sys

N = int(sys.argv[1]) if len(sys.argv) > 1 else 100_000
rnd = random.Random(42)
out = sys.stdout.buffer
mark = 0
t = 1_500_000_000
AUTHORS = [("Ada", "ada@example.com"), ("Bo", "bo@example.com"), ("Cy", "cy@example.com"), ("Di", "di@example.com")]


def w(s):
    out.write(s.encode() if isinstance(s, str) else s)


def blob(data: bytes) -> int:
    global mark
    mark += 1
    w(f"blob\nmark :{mark}\ndata {len(data)}\n")
    w(data)
    w("\n")
    return mark


def commit(ref, parents, msg, files):
    """files: list of (path, data-bytes). Returns the commit mark."""
    global mark, t
    blobs = [(p, blob(d)) for p, d in files]
    mark += 1
    t += rnd.randint(30, 4000)
    name, email = rnd.choice(AUTHORS)
    w(f"commit {ref}\nmark :{mark}\n")
    w(f"author {name} <{email}> {t} +0000\ncommitter {name} <{email}> {t} +0000\n")
    m = msg.encode()
    w(f"data {len(m)}\n")
    w(m)
    w("\n")
    if parents:
        w(f"from :{parents[0]}\n")
        for p in parents[1:]:
            w(f"merge :{p}\n")
    for p, b in blobs:
        w(f"M 100644 :{b} {p}\n")
    w("\n")
    return mark


count = 0
tips = {}


def c(branch, parents=None, msg=None, files=None):
    global count
    count += 1
    ps = parents if parents is not None else ([tips[branch]] if branch in tips else [])
    f = files or [(f"src/m{rnd.randint(0, 400)}.txt", f"{count} {rnd.random()}\n".encode())]
    tips[branch] = commit(f"refs/heads/{branch}", ps, msg or f"feat: change {count} on {branch}", f)
    return tips[branch]


c("main", msg="chore: initial commit")
tips["develop"] = tips["main"]
live = {}  # feature name -> remaining commits
feat_no = 0
tag_no = 0
big_done = wide_done = False
while count < N:
    r = rnd.random()
    if r < 0.014 or not live:
        feat_no += 1
        name = f"feature/f{feat_no}"
        tips[name] = tips["develop"]
        live[name] = rnd.randint(2, 60)
    elif r < 0.33:
        c("develop")
    elif r < 0.40:
        # Release lines get occasional fixes, cherry-pick-ish, and merge back into develop.
        rel = f"release/{rnd.randint(1, 3)}"
        if rel not in tips:
            tips[rel] = tips["main"]
        c(rel, msg=f"fix: patch on {rel}")
        if rnd.random() < 0.2:
            c("develop", parents=[tips["develop"], tips[rel]], msg=f"Merge branch '{rel}' into develop")
    elif r < 0.43:
        c("main", parents=[tips["main"], tips["develop"]], msg="Merge branch 'develop'")
        if rnd.random() < 0.3 and tag_no < 300:
            tag_no += 1
            w(f"reset refs/tags/v0.{tag_no}\nfrom :{tips['main']}\n\n")
    else:
        name = rnd.choice(list(live))
        if not big_done and count > N * 0.9:
            big_done = True
            data = "".join(f"line {i} {rnd.random()}\n" for i in range(50_000)).encode()
            c(name, msg="feat: regenerate a 50k-line table", files=[("big/table.txt", data)])
        elif not wide_done and count > N * 0.95:
            wide_done = True
            c(name, msg="refactor: touch 5k files", files=[(f"wide/d{i // 100}/f{i}.txt", f"{i}\n".encode()) for i in range(5000)])
        else:
            c(name)
        live[name] -= 1
        if live[name] <= 0:
            del live[name]
            if rnd.random() < 0.97:
                c("develop", parents=[tips["develop"], tips[name]], msg=f"Merge pull request #{feat_no} from {name}")
                # Most merged feature branches get deleted.
                if rnd.random() < 0.85:
                    w(f"reset refs/heads/{name}\nfrom 0000000000000000000000000000000000000000\n\n")
# Leave origin/* copies of the long-lived branches.
for b in ["main", "develop", "release/1", "release/2", "release/3"]:
    if b in tips:
        w(f"reset refs/remotes/origin/{b}\nfrom :{tips[b]}\n\n")
sys.stderr.write(f"commits={count} features={feat_no} tags={tag_no}\n")
