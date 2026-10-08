import { Icon } from "./components/Icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, DEMO_PATH, isTauri, keepsTabs } from "./api";
import { AuthDialog } from "./components/AuthDialog";
import { type CloneInit, CloneDialog, ConnectActions, RecentList, RepoMenu, useRecent } from "./components/Connect";
import { type Confirm, ConfirmDialog } from "./components/ConfirmDialog";
import { Boundary, TabCrash } from "./components/Crash";
import { Galaxy } from "./components/Galaxy";
import { SettingsDialog, type SettingsSection } from "./components/SettingsDialog";
import { SpaceBackdrop } from "./components/Planet";
import { TabBar } from "./components/TabBar";
import { UpdateNotice } from "./components/Update";
import { ProOffer } from "./components/ProOffer";
import { GitMissing, ReportDialog } from "./components/Report";
import { isUnexpected } from "./report";
import { copyText, onShareFailure } from "./share";
import { refreshPro } from "./pro";
import { useLicenseCheck } from "./components/License";
import { Wordmark } from "./components/Wordmark";
import { resolveLocale, setLocale, t } from "./i18n";
import { Rich } from "./i18n/Rich";
import { repoName } from "./recent";
import { isTypingTarget } from "./keys";
import { RepoView } from "./RepoView";
import type { ToastAction } from "./repo/state";
import { defaults, parseSettings, type Settings } from "./settings";
import { activeTab, addEmpty, closeTab, cycle, openIn, parseTabs, selectAt, serializeTabs, type Tabs } from "./tabs";
import "./App.css";
import { readStored, writeStored } from "./storage";

type Toast = { id: number; kind: "ok" | "err"; text: string; action?: ToastAction };

/** `?page=N` overrides the history page size for demos and e2e. */
const PAGE_OVERRIDE = Number(new URLSearchParams(window.location.search).get("page")) || null;

const TABS = "ddugit.tabs";
/** Before tabs, only the last repository was remembered. */
const LAST_REPO = "ddugit.lastRepo";
const SETTINGS = "ddugit.settings";
/** Before the settings screen, only this one flag was stored. */
const LEGACY_ANIMATE = "ddugit.animate";

function loadSettings(): Settings {
  const base = defaults(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const legacy = readStored(LEGACY_ANIMATE);
  if (legacy !== null) base.animate = legacy === "1";
  const settings = parseSettings(readStored(SETTINGS), base);
  setLocale(resolveLocale(settings.language));
  return settings;
}

/** Desktop: the tabs left open last time. Demo: the demo repository (or its last tabs, when it keeps them). */
const loadTabs = (): Tabs =>
  keepsTabs ? parseTabs(readStored(TABS), isTauri ? readStored(LAST_REPO) : DEMO_PATH) : parseTabs(null, DEMO_PATH);

/**
 * The window: a tab per open repository (each a `RepoView` that stays mounted
 * so its camera, selection and sheets survive switching), the ways to open
 * more, settings, and the toasts every tab reports through.
 */
export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsAt, setSettingsAt] = useState<SettingsSection | null>(null);
  const [tabs, setTabsState] = useState(loadTabs);
  /** The galaxy dashboard is showing (the home tab), over whichever tab is active. */
  const [home, setHome] = useState(false);
  const recent = useRecent();
  /** The repository menu is open under the active tab, at this x (window px). */
  const [repoMenu, setRepoMenu] = useState<number | null>(null);
  /** Repository names as their snapshots report them, for the tab labels. */
  const [names, setNames] = useState<Record<string, string>>({});
  const [clone, setClone] = useState<CloneInit | null>(null);
  const [cloneAuth, setCloneAuth] = useState<{ req: Required<CloneInit>; output: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** A folder is being dragged over the window. */
  const [dropping, setDropping] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** The problem report is open (with the error toast it came from). */
  const [report, setReport] = useState<{ error: string | null } | null>(null);
  /** git can't be run: why (the startup check). */
  const [gitMissing, setGitMissing] = useState<string | null>(null);
  const toastId = useRef(0);
  /** The toast under the pointer: it isn't taken away while being read or copied. */
  const hoveredToast = useRef<number | null>(null);
  const page = PAGE_OVERRIDE ?? settings.historyPage;
  const current = activeTab(tabs);
  const welcome = home || !current.path;

  /** Change the tabs; showing a tab leaves home unless `stay` (closing a tab from home). */
  const setTabs = useCallback((f: (t: Tabs) => Tabs, stay = false) => {
    if (!stay) setHome(false);
    setTabsState((old) => {
      const next = f(old);
      if (keepsTabs) writeStored(TABS, serializeTabs(next));
      return next;
    });
    setRepoMenu(null);
  }, []);

  const toast = useCallback((kind: Toast["kind"], text: string, action?: ToastAction) => {
    const id = ++toastId.current;
    // A backend failure (not git's own refusal) can be reported from its toast.
    if (kind === "err" && !action && isUnexpected(text))
      action = { label: t("report.action"), onClick: () => setReport({ error: text }) };
    setToasts((l) => [...l.slice(-3), { id, kind, text, action }]);
    // One with a button stays long enough to reach it; one under the pointer stays until it leaves.
    const later = (ms: number) =>
      setTimeout(
        () => (hoveredToast.current === id ? later(1500) : setToasts((l) => l.filter((x) => x.id !== id))),
        ms,
      );
    later(kind === "err" || action ? 7000 : 3200);
  }, []);

  useEffect(() => {
    onShareFailure((text) => toast("err", text));
  }, [toast]);
  useEffect(refreshPro, []);
  const remindLicense = useCallback((text: string) => toast("ok", text), [toast]);
  useLicenseCheck(remindLicense);

  // Patches merge into the latest settings: two in a row, or one from an async callback, keep each other's fields.
  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      writeStored(SETTINGS, JSON.stringify(next)); // the same write if React calls this twice
      return next;
    });
    // Every component reads the locale while rendering, so this re-render switches them all.
    if (patch.language) setLocale(resolveLocale(patch.language));
  };

  const openPath = useCallback((p: string) => setTabs((tb) => openIn(tb, p)), [setTabs]);
  /** Open several repositories as tabs (a group's "open all"). */
  const openMany = (paths: string[]) => setTabs((tb) => paths.reduce(openIn, tb));
  /** Grouped repositories by path, for the tab colours. */
  const groupOf = Object.fromEntries(
    recent.list.flatMap((r) => {
      const g = recent.groups.find((x) => x.id === r.group);
      return g ? [[r.path, { name: g.name, hue: g.hue }]] : [];
    }),
  );
  const touchRecent = recent.touch;
  const onLoaded = useCallback(
    (p: string, name: string) => {
      setNames((n) => (n[p] === name ? n : { ...n, [p]: name }));
      if (p !== DEMO_PATH) touchRecent(p);
    },
    [touchRecent],
  );

  useEffect(() => {
    void api.initialRepo().then((p) => p && openPath(p));
  }, [openPath]);

  // A git executable chosen in settings applies from startup; then make sure there is a git at all.
  const startGitPath = useRef(settings.gitPath);
  const checkGit = useCallback(
    () =>
      void api.gitVersion().then(
        () => setGitMissing(null),
        (e) => setGitMissing(String(e)),
      ),
    [],
  );
  useEffect(() => {
    const chosen =
      startGitPath.current && isTauri
        ? api.setGitPath(startGitPath.current).then(
            () => {},
            (e) => toast("err", t("app.gitPathError", { error: String(e) })),
          )
        : Promise.resolve();
    void chosen.then(checkGit);
  }, [toast, checkGit]);

  // Window-wide keys: tabs and the settings screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "0") {
        e.preventDefault();
        setHome(true);
        setRepoMenu(null);
      } else if (mod && e.key.toLowerCase() === "t") {
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
      } else if (e.key === "?" && !isTypingTarget(e.target)) setSettingsAt("shortcuts");
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
        home={home}
        onHome={() => {
          setHome(true);
          setRepoMenu(null);
        }}
        names={names}
        groupOf={groupOf}
        onSelect={(id) => setTabs((tb) => ({ ...tb, active: id }))}
        onClose={(id) => setTabs((tb) => closeTab(tb, id), home)}
        onNew={() => setTabs(addEmpty)}
        onRepoMenu={(x) => setRepoMenu((o) => (o === null ? x : null))}
        onSettings={() => setSettingsAt("screen")}
        menu={
          repoMenu !== null && current.path
            ? {
                x: repoMenu,
                node: (
                  <RepoMenu
                    recent={recent}
                    current={current.path}
                    onOpenPath={openPath}
                    onOpenMany={openMany}
                    {...connect}
                    onClose={() => setRepoMenu(null)}
                  />
                ),
              }
            : undefined
        }
      />
      <UpdateNotice onError={(text) => toast("err", text)} />
      {tabs.list.map((tab) =>
        tab.path ? (
          // One tab's crash leaves the others (and the window) working.
          <Boundary
            key={tab.id}
            fallback={(error, reload) => (
              <TabCrash
                error={error}
                active={!home && tab.id === tabs.active}
                onReload={reload}
                onReport={(text) => setReport({ error: text })}
              />
            )}
          >
            <RepoView
              path={tab.path}
              active={!home && tab.id === tabs.active}
              settings={settings}
              page={page}
              toast={toast}
              onLoaded={onLoaded}
              onChangeSettings={updateSettings}
              onOpenPath={openPath}
              onRepoMenu={() => setRepoMenu(document.querySelector(".tab.on")?.getBoundingClientRect().left ?? 60)}
            />
          </Boundary>
        ) : null,
      )}
      {welcome && (
        <div className="welcome">
          <SpaceBackdrop animate={settings.animate} space={settings.space} />
          <h1 className="brand">
            <Wordmark />
          </h1>
          <p>{t("app.tagline")}</p>
          <ConnectActions primary {...connect} />
          <ul className="welcome-hints muted small">
            {isTauri && <li>{t("welcome.drop")}</li>}
            <li>{t("welcome.forges")}</li>
            <li>
              <button className="ghost" onClick={() => setSettingsAt("shortcuts")}>
                <kbd>?</kbd> {t("welcome.shortcuts")}
              </button>
            </li>
          </ul>
          {recent.list.some((r) => r.path !== DEMO_PATH) ? (
            <Galaxy
              recent={recent}
              confirmFetch={settings.confirmRemote.fetch}
              onOpen={openPath}
              onOpenMany={openMany}
              toast={toast}
            />
          ) : (
            <section className="welcome-recent">
              <div className="eyebrow">{t("connect.recent")}</div>
              <RecentList recent={recent} onOpen={openPath} />
            </section>
          )}
          <button className="ghost" onClick={() => openPath(DEMO_PATH)}>
            <Icon name="sparkle" /> {t("app.demo")}
          </button>
        </div>
      )}

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
          signIn={["git", "clone", "--", cloneAuth.req.url]}
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
      {settingsAt && (
        <SettingsDialog
          settings={settings}
          at={settingsAt}
          onChange={updateSettings}
          onClose={() => setSettingsAt(null)}
          onReport={() => setReport({ error: null })}
        />
      )}
      {report && (
        <ReportDialog
          lastError={report.error}
          onSent={() => {
            setReport(null);
            toast("ok", t("report.sent"));
          }}
          onClose={() => setReport(null)}
        />
      )}
      {gitMissing && (
        <GitMissing
          error={gitMissing}
          onRecheck={checkGit}
          onSetPath={() => {
            setGitMissing(null);
            setSettingsAt("git");
          }}
          onClose={() => setGitMissing(null)}
        />
      )}
      <ProOffer onLicense={() => setSettingsAt("license")} />
      <div className={`toasts floating ${welcome ? "welcome-toasts" : ""}`}>
        {toasts.map((item) => {
          const close = () => setToasts((l) => l.filter((x) => x.id !== item.id));
          return (
            <div
              key={item.id}
              className={`toast ${item.kind}`}
              onMouseEnter={() => (hoveredToast.current = item.id)}
              onMouseLeave={() => (hoveredToast.current = null)}
            >
              <span className="toast-text">{item.text}</span>
              <span className="toast-actions">
                {item.action && (
                  <button
                    onClick={() => {
                      item.action!.onClick();
                      close();
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
                {item.kind === "err" && (
                  <button title={t("common.copy")} aria-label={t("common.copy")} onClick={() => copyText(item.text)}>
                    <Icon name="copy" size={12} />
                  </button>
                )}
                <button title={t("common.close")} aria-label={t("common.close")} onClick={close}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
