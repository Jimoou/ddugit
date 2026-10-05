import { useEffect, useState, type KeyboardEvent } from "react";
import { api } from "../api";
import { t } from "../i18n";
import {
  matchesProfile,
  profileError,
  profileFrom,
  sameIdentity,
  upsertProfile,
  viewIdentity,
  type IdentityView,
} from "../identity";
import type { Identity, IdentityOp, Profile, SignFormat, SigningKeys } from "../types";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Icon } from "./Icon";

/** Read the identity of `path` (`null`: global); `reload` reads it again after a change. */
function useIdentity(path: string | null) {
  const [loaded, setLoaded] = useState<{ key: string; id: Identity } | null>(null);
  const [tick, setTick] = useState(0);
  const key = `${path}\n${tick}`;
  useEffect(() => {
    let live = true;
    api.identity(path).then(
      (id) => live && setLoaded({ key, id }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [path, key]);
  // Keep showing the last one while re-reading, so the line doesn't flicker.
  return { identity: loaded?.id ?? null, reload: () => setTick((n) => n + 1) };
}

const signsTitle = (v: IdentityView, id: Identity) =>
  t("identity.signsTitle", { format: v.signs === "ssh" ? "SSH" : "GPG", key: id.key?.value ?? "" });

interface LineProps {
  path: string;
  profiles: Profile[];
  onProfiles(next: Profile[]): void;
  /** Run an identity change through the repository's `run` (toast, busy). */
  onChange(label: string, op: IdentityOp): Promise<unknown>;
}

/** The composer's "who commits": name <email>, where it comes from, and a menu to switch profile here. */
export function IdentityLine({ path, profiles, onProfiles, onChange }: LineProps) {
  const { identity, reload } = useIdentity(path);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!identity) return <div className="identity-line" />;
  const v = viewIdentity(identity);
  const change = (label: string, op: IdentityOp) => void onChange(label, op).then(reload);
  const current = profileFrom(identity);

  // The choices first, the current one checked (not greyed out); creating a profile comes last.
  const items: MenuItem[] = profiles.map((p) => ({
    label: `${p.name} <${p.email}>`,
    icon: v.local && matchesProfile(identity, p) ? ("check" as const) : undefined,
    hint: p.signing ? `${t("identity.signs")} · ${p.signing.format === "ssh" ? "SSH" : "GPG"}` : undefined,
    onSelect: () => change(t("identity.applied", { name: p.name }), { kind: "apply", scope: "local", profile: p }),
  }));
  items.push({
    label: t("identity.useGlobal"),
    icon: v.local ? undefined : "check",
    onSelect: () => v.local && change(t("identity.cleared"), { kind: "clear", scope: "local" }),
  });
  if (identity.key?.value)
    items.push(
      "separator",
      v.signs
        ? {
            label: t("identity.signOff"),
            onSelect: () => change(t("identity.signedOff"), { kind: "sign", scope: "local", on: false }),
          }
        : {
            label: t("identity.signOn"),
            onSelect: () => change(t("identity.signedOn"), { kind: "sign", scope: "local", on: true }),
          },
    );
  if (current && !profiles.some((p) => sameIdentity(identity, p)))
    items.push("separator", {
      label: t("identity.saveCurrent"),
      icon: "plus",
      onSelect: () => onProfiles([...profiles, current]),
    });
  else if (!profiles.length)
    items.push("separator", { label: t("identity.noProfiles"), disabled: true, onSelect: () => {} });

  return (
    <>
      <div className={`identity-line ${v.missing ? "missing" : ""}`}>
        <button
          className="who"
          aria-label={t("identity.switch")}
          title={t("identity.switch")}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <span className="text">{v.text || t("identity.none")}</span>
          <Icon name="chevronDown" size={12} />
        </button>
        <span className="scope" title={v.local ? t("identity.scope.localTitle") : t("identity.scope.globalTitle")}>
          {v.local ? t("identity.scope.local") : t("identity.scope.global")}
        </span>
        {v.signs && (
          <span className="signs" title={signsTitle(v, identity)}>
            <Icon name="key" size={11} />
            {t("identity.signs")}
          </span>
        )}
      </div>
      {v.missing && <div className="note warn">{t("identity.missing")}</div>}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={t("identity.menuTitle")}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

const EMPTY: Profile = { name: "", email: "", signing: null };

interface SectionProps {
  profiles: Profile[];
  onProfiles(next: Profile[]): void;
}

/** Settings → profiles: the global identity, saved profiles, and the form to add or edit one. */
export function ProfilesSection({ profiles, onProfiles }: SectionProps) {
  const { identity: global, reload } = useIdentity(null);
  const [editing, setEditing] = useState<{ at: number | null; draft: Profile } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<SigningKeys | null>(null);
  const formOpen = editing !== null;
  useEffect(() => {
    let live = true;
    if (formOpen && !keys)
      api.signingKeys().then(
        (k) => live && setKeys(k),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [formOpen, keys]);

  const act = async (op: IdentityOp) => {
    setError(null);
    try {
      const r = await api.setIdentity(null, op);
      if (r.status !== "ok") setError(r.output);
    } catch (e) {
      setError(String(e));
    }
    reload();
  };
  const g = global && viewIdentity(global);
  const offer = !profiles.length && global && profileFrom(global);

  const save = () => {
    if (!editing) return;
    const why = profileError(editing.draft);
    if (why) return setError(t(why));
    setError(null);
    onProfiles(upsertProfile(profiles, editing.draft, editing.at));
    setEditing(null);
  };

  return (
    <section className="profiles">
      <h4>{t("identity.profiles")}</h4>
      <p className="muted small">{t("identity.profilesHint")}</p>
      <div className="global-identity">
        <span className="tag">{t("identity.global")}</span>
        <span className={g?.missing ? "warn-text" : ""}>{g && !g.missing ? g.text : t("identity.globalNone")}</span>
        {global?.key?.value && (
          <label className="check">
            <input
              type="checkbox"
              checked={!!global.sign?.value}
              onChange={(e) => void act({ kind: "sign", scope: "global", on: e.target.checked })}
            />
            {t("identity.globalSign")}
          </label>
        )}
      </div>
      {offer && (
        <div className="offer">
          {t("identity.offer")} <button onClick={() => onProfiles([offer])}>{t("identity.offerGo")}</button>
        </div>
      )}
      <ul className="profile-list">
        {profiles.map((p, i) => (
          <li key={`${p.name}\n${p.email}`}>
            <span className="who">
              {p.name} <span className="muted">&lt;{p.email}&gt;</span>
            </span>
            {p.signing && (
              <span className="signs" title={p.signing.key}>
                <Icon name="key" size={11} />
                {p.signing.format === "ssh" ? "SSH" : "GPG"}
              </span>
            )}
            <span className="spacer" />
            {global && matchesProfile(global, p) ? (
              <span className="tag">{t("identity.isGlobal")}</span>
            ) : (
              <button className="ghost" onClick={() => void act({ kind: "apply", scope: "global", profile: p })}>
                {t("identity.useAsGlobal")}
              </button>
            )}
            <button className="ghost" onClick={() => setEditing({ at: i, draft: p })}>
              {t("identity.edit")}
            </button>
            <button className="ghost danger-text" onClick={() => onProfiles(profiles.filter((_, j) => j !== i))}>
              {t("identity.delete")}
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <ProfileForm
          draft={editing.draft}
          keys={keys}
          onDraft={(draft) => setEditing({ ...editing, draft })}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
        />
      ) : (
        <button onClick={() => setEditing({ at: null, draft: EMPTY })}>{t("identity.add")}</button>
      )}
      {error && <p className="note warn">{error}</p>}
    </section>
  );
}

interface FormProps {
  draft: Profile;
  keys: SigningKeys | null;
  onDraft(p: Profile): void;
  onSave(): void;
  onCancel(): void;
}

function ProfileForm({ draft, keys, onDraft, onSave, onCancel }: FormProps) {
  const format = draft.signing?.format ?? null;
  const known = format === "ssh" ? keys?.ssh : format === "openpgp" ? keys?.gpg : null;
  const enter = (e: KeyboardEvent) => {
    if (e.key === "Enter") onSave();
  };
  return (
    <div className="profile-form">
      <label className="field">
        {t("identity.name")}
        <input
          className="text"
          value={draft.name}
          placeholder="Hong Gildong"
          onChange={(e) => onDraft({ ...draft, name: e.target.value })}
          onKeyDown={enter}
        />
      </label>
      <label className="field">
        {t("identity.email")}
        <input
          className="text"
          type="email"
          value={draft.email}
          placeholder="you@example.com"
          onChange={(e) => onDraft({ ...draft, email: e.target.value })}
          onKeyDown={enter}
        />
      </label>
      <label className="field">
        {t("identity.signing")}
        <select
          value={format ?? ""}
          onChange={(e) => {
            const f = e.target.value as SignFormat | "";
            onDraft({ ...draft, signing: f ? { format: f, key: draft.signing?.key ?? "" } : null });
          }}
        >
          <option value="">{t("identity.signingNone")}</option>
          <option value="openpgp">GPG</option>
          <option value="ssh">SSH</option>
        </select>
      </label>
      {draft.signing && (
        <label className="field">
          {t("identity.key")}
          <input
            className="text"
            list="signing-keys"
            value={draft.signing.key}
            placeholder={format === "ssh" ? t("identity.keySsh") : t("identity.keyGpg")}
            onChange={(e) => onDraft({ ...draft, signing: { format: format ?? "openpgp", key: e.target.value } })}
            onKeyDown={enter}
          />
          <datalist id="signing-keys">
            {known?.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </datalist>
        </label>
      )}
      {format === "openpgp" && keys && keys.gpg === null && <p className="muted small">{t("identity.noGpg")}</p>}
      <div className="row">
        <button className="primary" onClick={onSave}>
          {t("identity.save")}
        </button>
        <button className="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
