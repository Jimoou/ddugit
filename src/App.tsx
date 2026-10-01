import { useCallback, useEffect, useRef, useState } from "react";
import { api, DEMO_PATH, isTauri } from "./api";
import { AuthDialog } from "./components/AuthDialog";
import { type CloneInit, CloneDialog, ConnectActions, RecentList, RepoMenu, useRecent } from "./components/Connect";
import { type Confirm, ConfirmDialog } from "./components/ConfirmDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { TabBar } from "./components/TabBar";
import { resolveLocale, setLocale, t } from "./i18n";
import { Rich } from "./i18n/Rich";
import { repoName } from "./recent";
import { RepoView } from "./RepoView";
import { defaults, parseSettings, type Settings } from "./settings";
import { activeTab, addEmpty, closeTab, cycle, openIn, parseTabs, selectAt, serializeTabs, type Tabs } from "./tabs";
import "./App.css";

type Toast = { id: number; kind: "ok" | "err"; text: string };

/** `?page=N` overrides the history page size for demos and e2e. */
const PAGE_OVERRIDE = Number(new URLSearchParams(window.location.search).get("page")) || null;

const TABS = "otgit.tabs";
/** Before tabs, only the last repository was remembered. */
const LAST_REPO = "otgit.lastRepo";
const SETTINGS = "otgit.settings";
/** Before the settings screen, only this one flag was stored. */
const LEGACY_ANIMATE = "otgit.animate";

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

function loadSettings(): Settings {
  const base = defaults(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const legacy = store(LEGACY_ANIMATE);
  if (legacy !== null) base.animate = legacy === "1";
  const settings = parseSettings(store(SETTINGS), base);
  setLocale(resolveLocale(settings.language));
  return settings;
}

/** Desktop: the tabs left open last time. Demo: the demo repository. */
const loadTabs = (): Tabs => (isTauri ? parseTabs(store(TABS), store(LAST_REPO)) : parseTabs(null, DEMO_PATH));

/**
 * The window: a tab per open repository (each a `RepoView` that stays mounted
 * so its camera, selection and sheets survive switching), the ways to open
 * more, settings, and the toasts every tab reports through.
 */
export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabs, setTabsState] = useState(loadTabs);
  const recent = useRecent();
  const [repoMenu, setRepoMenu] = useState(false);
  const [clone, setClone] = useState<CloneInit | null>(null);
  const [cloneAuth, setCloneAuth] = useState<{ req: Required<CloneInit>; output: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** A folder is being dragged over the window. */
  const [dropping, setDropping] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Bumped on every tab switch to replay the warp (adjusted while rendering). */
  const [warp, setWarp] = useState({ n: 0, active: tabs.active });
  if (warp.active !== tabs.active) setWarp({ n: warp.n + 1, active: tabs.active });
  const toastId = useRef(0);
  const page = PAGE_OVERRIDE ?? settings.historyPage;
  const current = activeTab(tabs);

  const setTabs = useCallback((f: (t: Tabs) => Tabs) => {
    setTabsState((old) => {
      const next = f(old);
      if (isTauri) store(TABS, serializeTabs(next));
      return next;
    });
    setRepoMenu(false);
  }, []);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), kind === "err" ? 7000 : 3200);
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    store(SETTINGS, JSON.stringify(next));
    // Every component reads the locale while rendering, so this re-render switches them all.
    if (patch.language) setLocale(resolveLocale(patch.language));
  };

  const openPath = useCallback((p: string) => setTabs((tb) => openIn(tb, p)), [setTabs]);
  const touchRecent = recent.touch;
  const onLoaded = useCallback((p: string) => p !== DEMO_PATH && touchRecent(p), [touchRecent]);

  useEffect(() => {
    void api.initialRepo().then((p) => p && openPath(p));
  }, [openPath]);

  // A git executable chosen in settings applies from startup.
  const startGitPath = useRef(settings.gitPath);
  useEffect(() => {
    if (startGitPath.current && isTauri)
      api.setGitPath(startGitPath.current).catch((e) => toast("err", t("app.gitPathError", { error: String(e) })));
  }, [toast]);

  // Window-wide keys: tabs and the settings screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTabs(addEmpty);
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        setTabs((tb) => closeTab(tb, tb.active));
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        setTabs((tb) => cycle(tb, e.shiftKey ? -1 : 1));
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        setTabs((tb) => selectAt(tb, Number(e.key) - 1));
      } else if (e.key === "?" && !typing) setSettingsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTabs]);

  const openRepo = async () => {
    const p = await api.pickFolder();
    if (p) openPath(p);
  };

  /** Make `dir` a repository (if it isn't one already) and open it. */
  const initAt = async (dir: string) => {
    if (await api.repoRoot(dir)) {
      toast("ok", t("connect.init.exists"));
      return openPath(dir);
    }
    try {
      const r = await api.init(dir);
      if (r.status !== "ok") return toast("err", r.output);
      toast("ok", t("connect.init.done"));
      openPath(dir);
    } catch (e) {
      toast("err", String(e));
    }
  };
  const newRepo = async () => {
    const dir = await api.pickFolder(t("connect.init.folder"));
    if (dir) await initAt(dir);
  };

  /** A folder (or file) dropped on the window: open its repository, or offer to create one. */
  const openDropped = async (dropped: string) => {
    const root = await api.repoRoot(dropped);
    if (root) return openPath(root);
    setConfirm({
      title: t("connect.notRepo.title"),
      confirmLabel: t("connect.notRepo.go"),
      body: (
        <p>
          <Rich k="connect.notRepo.body" vars={{ path: dropped }} />
        </p>
      ),
      onConfirm: () => {
        setConfirm(null);
        void initAt(dropped);
      },
    });
  };
  const dropRef = useRef(openDropped);
  useEffect(() => {
    dropRef.current = openDropped;
  });

  // Folders dragged onto the window (desktop app only).
  useEffect(() => {
    if (!isTauri) return;
    let live = true;
    let stop = () => {};
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(({ payload }) => {
          if (payload.type === "over" || payload.type === "enter") setDropping(true);
          else if (payload.type === "leave") setDropping(false);
          else {
            setDropping(false);
            if (payload.paths[0]) void dropRef.current(payload.paths[0]);
          }
        }),
      )
      .then((un) => (live ? (stop = un) : un()));
    return () => {
      live = false;
      stop();
    };
  }, []);

  const connect = {
    onOpen: () => void openRepo(),
    onClone: () => setClone({}),
    onInit: () => void newRepo(),
  };

  return (
    <div className="shell">
      <TabBar
        tabs={tabs}
        onSelect={(id) => setTabs((tb) => ({ ...tb, active: id }))}
        onClose={(id) => setTabs((tb) => closeTab(tb, id))}
        onNew={() => setTabs(addEmpty)}
      />
      {tabs.list.map((tab) =>
        tab.path ? (
          <RepoView
            key={tab.id}
            path={tab.path}
            active={tab.id === tabs.active}
            settings={settings}
            page={page}
            toast={toast}
            onLoaded={onLoaded}
            onSettings={() => setSettingsOpen(true)}
            onToggleAnimate={() => updateSettings({ animate: !settings.animate })}
            onRepoMenu={() => setRepoMenu((o) => !o)}
            repoMenu={
              repoMenu &&
              tab.id === tabs.active && (
                <RepoMenu
                  recent={recent}
                  current={tab.path}
                  onOpenPath={openPath}
                  {...connect}
                  onClose={() => setRepoMenu(false)}
                />
              )
            }
          />
        ) : (
          tab.id === tabs.active && (
            <div key={tab.id} className="welcome">
              <h1 className="wordmark">otgit</h1>
              <p>{t("app.tagline")}</p>
              <ConnectActions primary {...connect} />
              <section className="welcome-recent">
                <div className="eyebrow">{t("connect.recent")}</div>
                <RecentList recent={recent} onOpen={openPath} />
              </section>
              <button className="ghost" onClick={() => openPath(DEMO_PATH)}>
                {t("app.demo")}
              </button>
            </div>
          )
        ),
      )}

      {settings.animate && warp.n > 0 && <div key={warp.n} className="warp" aria-hidden />}

      {clone && (
        <CloneDialog
          init={clone}
          onCancel={() => setClone(null)}
          onCloned={(dest) => {
            setClone(null);
            toast("ok", t("connect.cloned", { name: repoName(dest) }));
            openPath(dest);
          }}
          onAuth={(req, output) => {
            setClone(null);
            setCloneAuth({ req, output });
          }}
        />
      )}
      {cloneAuth && (
        <AuthDialog
          url={cloneAuth.req.url}
          output={cloneAuth.output}
          repoPath={cloneAuth.req.parent}
          fetchCmd={`git clone ${cloneAuth.req.url}`}
          busy={false}
          onClose={() => setCloneAuth(null)}
          onRetry={() => {
            setClone(cloneAuth.req);
            setCloneAuth(null);
          }}
        />
      )}
      {confirm && <ConfirmDialog confirm={confirm} busy={false} onCancel={() => setConfirm(null)} />}
      {dropping && (
        <div className="drop-zone">
          <div>{t("connect.drop")}</div>
        </div>
      )}
      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      )}
      <div className={`toasts floating ${current.path ? "" : "welcome-toasts"}`}>
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
