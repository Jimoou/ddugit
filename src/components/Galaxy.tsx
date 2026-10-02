// The galaxy dashboard on the new-tab screen: every recent repository as a
// world, with what it needs (stopped work, changes, commits to pull or push)
// read at a glance, and one "fetch all" for the lot.

import { useCallback, useEffect, useState } from "react";
import { api, DEMO_PATH } from "../api";
import { fmtAgo } from "../format";
import { fetchable, signals, tally } from "../galaxy";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { repoName } from "../recent";
import type { RepoGlance } from "../types";
import type { Recent } from "./Connect";
import { type Confirm, ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { PlanetDot } from "./Planet";

/** Fetches running side by side in "fetch all". */
const FETCH_LANES = 3;

type Fetched = { status: "run" | "ok" | "auth" | "failed"; output?: string };

interface Props {
  recent: Recent;
  /** Ask before "fetch all" (the fetch confirmation setting). */
  confirmFetch: boolean;
  onOpen(path: string): void;
  toast(kind: "ok" | "err", text: string): void;
}

export function Galaxy({ recent, confirmFetch, onOpen, toast }: Props) {
  const paths = recent.list.map((r) => r.path).filter((p) => p !== DEMO_PATH);
  const key = paths.join("\n");
  const [loaded, setLoaded] = useState<{ key: string; byPath: Map<string, RepoGlance> } | null>(null);
  const [fetched, setFetched] = useState<Record<string, Fetched>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const byPath = loaded && loaded.key === key ? loaded.byPath : null;

  // Read every world now, and again whenever the window comes back to the front.
  useEffect(() => {
    let live = true;
    const list = key ? key.split("\n") : [];
    const load = () =>
      void api
        .glance(list)
        .then((l) => live && setLoaded({ key, byPath: new Map(l.map((g) => [g.path, g])) }))
        .catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, [key]);

  const reread = useCallback(async (path: string) => {
    const [g] = await api.glance([path]);
    if (g) setLoaded((l) => l && { ...l, byPath: new Map(l.byPath).set(path, g) });
  }, []);

  const glances = byPath ? paths.flatMap((p) => byPath.get(p) ?? []) : [];
  const targets = fetchable(glances);

  const fetchAll = async () => {
    setConfirm(null);
    const queue = [...targets];
    let ok = 0;
    const lane = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const path = p;
        setFetched((f) => ({ ...f, [path]: { status: "run" } }));
        let done: Fetched;
        try {
          const r = await api.remote(path, "fetch");
          done = { status: r.status === "ok" ? "ok" : r.status === "auth" ? "auth" : "failed", output: r.output };
        } catch (e) {
          done = { status: "failed", output: String(e) };
        }
        if (done.status === "ok") ok++;
        setFetched((f) => ({ ...f, [path]: done }));
        await reread(path).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: FETCH_LANES }, lane));
    const failed = targets.length - ok;
    if (failed) toast("err", t("galaxy.fetchedSome", { ok, failed }));
    else toast("ok", t("galaxy.fetched", { n: ok }));
  };

  const askFetchAll = () => {
    if (!confirmFetch) return void fetchAll();
    setConfirm({
      title: t("galaxy.confirm.title"),
      confirmLabel: t("galaxy.confirm.go", { n: targets.length }),
      body: (
        <p>
          <Rich k="galaxy.confirm.body" vars={{ n: targets.length }} />
        </p>
      ),
      onConfirm: () => void fetchAll(),
    });
  };
  const running = Object.values(fetched).some((f) => f.status === "run");

  return (
    <section className="galaxy" aria-label={t("galaxy.label")}>
      <header className="galaxy-head">
        <div className="eyebrow">{t("galaxy.title", { n: paths.length })}</div>
        <div className="galaxy-tally">
          {tally(glances).map((l) => (
            <span key={l.signal} className={`sig sig-${l.signal}`}>
              {t(`galaxy.tally.${l.signal}`, { n: l.n })}
            </span>
          ))}
        </div>
        <button disabled={running || targets.length === 0} onClick={askFetchAll}>
          <Icon name="fetch" size={13} /> {running ? t("galaxy.fetching") : t("galaxy.fetchAll")}
        </button>
      </header>
      <ul className="worlds">
        {paths.map((path) => {
          const g = byPath?.get(path);
          const f = fetched[path];
          const starred = recent.list.find((r) => r.path === path)?.starred ?? false;
          const lit = g ? signals(g) : [];
          return (
            <li key={path} className={`world ${g?.error ? "missing" : ""}`}>
              <button className="world-open" title={g?.error ?? path} onClick={() => onOpen(path)}>
                <span className="world-name">
                  <PlanetDot path={path} big /> <b>{repoName(path)}</b>
                </span>
                <span className="world-path">{path}</span>
                {g && !g.error && (
                  <span className="world-branch">
                    <Icon name="branch" size={11} /> {g.branch ?? t("galaxy.detached")}
                    {g.upstream && <span className="muted"> → {g.upstream}</span>}
                  </span>
                )}
                <span className="world-signals">
                  {!g ? (
                    <span className="muted">…</span>
                  ) : lit.length === 0 ? (
                    <span className="sig sig-quiet">{t("galaxy.quiet")}</span>
                  ) : (
                    lit.map((l) => (
                      <span key={l.signal} className={`sig sig-${l.signal}`}>
                        {t(`galaxy.sig.${l.signal}`, { n: l.n })}
                      </span>
                    ))
                  )}
                </span>
                {g && !g.error && (
                  <span className="world-last">
                    {g.last ? (
                      <>
                        {g.last.summary} <span className="muted">· {fmtAgo(g.last.time)}</span>
                      </>
                    ) : (
                      <span className="muted">{t("galaxy.noCommits")}</span>
                    )}
                  </span>
                )}
              </button>
              {f && (
                <span className={`world-fetch ${f.status}`} title={f.output}>
                  {f.status === "run" ? (
                    t("galaxy.fetching")
                  ) : f.status === "ok" ? (
                    <Icon name="check" size={12} />
                  ) : (
                    t(f.status === "auth" ? "galaxy.fetchAuth" : "galaxy.fetchFailed")
                  )}
                </span>
              )}
              <span className="world-tools">
                <button
                  className={`icon star ${starred ? "on" : ""}`}
                  aria-pressed={starred}
                  aria-label={starred ? t("connect.unstar") : t("connect.star")}
                  title={starred ? t("connect.unstar") : t("connect.star")}
                  onClick={() => recent.star(path)}
                >
                  <Icon name="star" filled={starred} />
                </button>
                <button
                  className="icon"
                  aria-label={t("connect.forget")}
                  title={t("connect.forget")}
                  onClick={() => recent.forget(path)}
                >
                  <Icon name="close" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {confirm && <ConfirmDialog confirm={confirm} busy={false} onCancel={() => setConfirm(null)} />}
    </section>
  );
}
