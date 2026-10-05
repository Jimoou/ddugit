// Pick one of your own repositories on GitHub / GitLab (public or self-hosted),
// for the clone and add-remote dialogs. Without a token it offers to connect.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { fmtAgo } from "../format";
import { FORGE_SOURCES, type Proto, type Source, filterRepos, repoUrl } from "../forgeRepos";
import { t } from "../i18n";
import { openLink } from "../share";
import type { ForgeKind, ForgeRepo, ForgeRepos } from "../types";
import { Icon } from "./Icon";
import { FORGE_NAME, TokenDialog } from "./Pulls";
import { Segmented } from "./Segmented";

const PROTO = "ddugit.forgeProto";

function readProto(): Proto {
  try {
    return localStorage.getItem(PROTO) === "ssh" ? "ssh" : "https";
  } catch {
    return "https";
  }
}

/** URL, GitHub, GitLab: where the repository comes from. A column beside the form (a row in a narrow window). */
export function SourceTabs(p: { value: Source; onChange(s: Source): void; disabled?: boolean }) {
  const sources: { id: Source; label: string; icon: "link" | ForgeKind }[] = [
    { id: "url", label: t("forge.source.url"), icon: "link" },
    ...FORGE_SOURCES.map((f) => ({ id: f.id, label: FORGE_NAME[f.kind], icon: f.kind })),
  ];
  return (
    <Segmented
      className="column"
      role="tablist"
      label={t("forge.sources")}
      value={p.value}
      onChange={p.onChange}
      disabled={p.disabled}
      options={sources.map((s) => ({
        value: s.id,
        label: (
          <>
            <Icon name={s.icon} /> {s.label}
          </>
        ),
      }))}
    />
  );
}

/** HTTPS or SSH: the two address forms of one forge repository. */
export function ProtoSwitch(p: { value: Proto; onChange(p: Proto): void; disabled?: boolean }) {
  return (
    <Segmented
      label={t("connect.clone.proto")}
      value={p.value}
      onChange={p.onChange}
      disabled={p.disabled}
      options={[
        { value: "https", label: "HTTPS" },
        { value: "ssh", label: "SSH" },
      ]}
    />
  );
}

export interface Picked {
  repo: ForgeRepo;
  url: string;
}

interface Props {
  kind: ForgeKind;
  /** Routes the demo (a repository path, or "" outside one). */
  path: string;
  picked: Picked | null;
  onPick(p: Picked | null): void;
  disabled?: boolean;
}

/** Host, search and the list of the user's repositories on it, with HTTPS / SSH. */
export function ForgeRepoPicker(p: Props) {
  const source = FORGE_SOURCES.find((f) => f.kind === p.kind)!;
  const [hostText, setHostText] = useState(source.host);
  const [host, setHost] = useState(source.host);
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [proto, setProto] = useState(readProto);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = `${p.kind}\n${host}\n${tick}`;
  const [loaded, setLoaded] = useState<{ key: string; r?: ForgeRepos; error?: string } | null>(null);

  useEffect(() => {
    let live = true;
    api.forgeRepos(p.path, p.kind, host).then(
      (r) => live && setLoaded({ key, r }),
      (e) => live && setLoaded({ key, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [key, p.path, p.kind, host]);

  const current = loaded && loaded.key === key ? loaded : null;
  const result = current?.r ?? null;
  const shown = useMemo(() => (result ? filterRepos(result.repos, query) : []), [result, query]);
  const name = FORGE_NAME[p.kind];

  const commitHost = () => {
    const h = hostText.trim();
    if (!h || h === host) return;
    setHost(h);
    p.onPick(null);
  };
  const pick = (repo: ForgeRepo, pr = proto) => p.onPick({ repo, url: repoUrl(repo, pr) });
  const switchProto = (pr: Proto) => {
    setProto(pr);
    try {
      localStorage.setItem(PROTO, pr);
    } catch {
      /* storage unavailable */
    }
    if (p.picked) pick(p.picked.repo, pr);
  };
  const saveToken = (token: string | null) => {
    if (!result) return;
    setSaving(true);
    api.setForgeToken(p.path, result.host, token).then(
      () => {
        setSaving(false);
        setConnecting(false);
        setTick((n) => n + 1);
      },
      (e) => {
        setSaving(false);
        setConnecting(false);
        setLoaded({ key, error: String(e) });
      },
    );
  };

  return (
    <div className="forge-picker">
      <label className="field col">
        <span className="row">
          {t("forge.host")}
          <span className="muted small">{t(`forge.host.hint.${p.kind}`)}</span>
        </span>
        <input
          className="text"
          value={hostText}
          disabled={p.disabled}
          spellCheck={false}
          aria-label={t("forge.host")}
          onChange={(e) => setHostText(e.target.value)}
          onBlur={commitHost}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            commitHost();
          }}
        />
      </label>

      {!current && <p className="muted forge-state">{t("forge.loading")}</p>}
      {current?.error && (
        <div className="forge-state">
          <pre className="note warn raw">{t("forge.failed", { error: current.error })}</pre>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            {t("forge.retry")}
          </button>
        </div>
      )}
      {result?.needsToken && (
        <div className="forge-state forge-connect">
          <p className="muted">
            {result.unauthorized ? t("pr.refused", { forge: name }) : t("forge.hint", { forge: name })}
          </p>
          <button type="button" className="primary" onClick={() => setConnecting(true)}>
            <Icon name={p.kind} /> {t("pr.connect", { forge: name })}
          </button>
        </div>
      )}
      {result && !result.needsToken && (
        <>
          <div className="row forge-search">
            <span className="search-box">
              <Icon name="search" />
              <input
                className="text"
                autoFocus
                placeholder={t("forge.search")}
                aria-label={t("forge.search")}
                value={query}
                disabled={p.disabled}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // Enter takes the first match when nothing is picked yet; with a pick, the form goes on.
                  if (p.picked && shown.includes(p.picked.repo)) return;
                  e.preventDefault();
                  if (shown[0]) pick(shown[0]);
                }}
              />
            </span>
            <ProtoSwitch value={proto} onChange={switchProto} disabled={p.disabled} />
          </div>
          <ul className="forge-repos" role="listbox" aria-label={t("forge.list", { forge: name })}>
            {shown.map((r) => {
              const on = p.picked?.repo.fullName === r.fullName;
              const when = Date.parse(r.updated);
              return (
                <li
                  key={r.fullName}
                  role="option"
                  aria-selected={on}
                  className={on ? "on" : ""}
                  title={repoUrl(r, proto)}
                  onClick={() => !p.disabled && pick(r)}
                >
                  <span className="forge-repo-head">
                    <b>{r.fullName}</b>
                    {r.private && (
                      <span className="forge-private">
                        <Icon name="lock" size={11} /> {t("forge.private")}
                      </span>
                    )}
                    {!Number.isNaN(when) && <span className="muted small when">{fmtAgo(when / 1000)}</span>}
                  </span>
                  {r.description && <span className="muted small desc">{r.description}</span>}
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="muted empty">{result.repos.length ? t("forge.noMatch") : t("forge.none")}</li>
            )}
          </ul>
          {result.user && <p className="muted small">{t("forge.user", { user: result.user, host: result.host })}</p>}
        </>
      )}

      {connecting &&
        result &&
        // Out of the surrounding form (its buttons would submit it), and its keys and clicks stay its own.
        createPortal(
          <div onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <TokenDialog
              forge={result}
              busy={saving}
              onSave={saveToken}
              onOpenPage={(url) => openLink(url, p.path)}
              onCancel={() => setConnecting(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
