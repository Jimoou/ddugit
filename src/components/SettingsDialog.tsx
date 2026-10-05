import { useEffect, useState } from "react";
import { api } from "../api";
import { isKey, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { HISTORY_PAGES, LANGUAGES, type Settings, SHORTCUTS } from "../settings";
import { ProfilesSection } from "./Identity";
import { LicenseSection } from "./License";

interface Props {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
}

/** Language names are shown in their own language so anyone can find theirs. */
const LANGUAGE_NAMES = { ko: "한국어", en: "English" } as const;

const label = (text: string) => (isKey(text) ? t(text) : text);

/** Settings plus the shortcut table (opened with ? or the ⚙ button). */
export function SettingsDialog({ settings, onChange, onClose }: Props) {
  const [gitPath, setGitPath] = useState(settings.gitPath);
  const [gitStatus, setGitStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  // Esc closes wherever focus is (a button disabled while checking drops it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applyGit = async () => {
    setChecking(true);
    try {
      const version = await api.setGitPath(gitPath);
      setGitStatus({ ok: true, text: version });
      onChange({ gitPath: gitPath.trim() });
    } catch (e) {
      setGitStatus({ ok: false, text: String(e) });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog settings"
        role="dialog"
        aria-label={t("settings.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow">{t("settings.title")}</div>

        <section>
          <h4>{t("settings.screen")}</h4>
          <label className="field">
            {t("settings.language")}
            <select
              value={settings.language}
              onChange={(e) => onChange({ language: LANGUAGES.find((l) => l === e.target.value) ?? "system" })}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l === "system" ? t("settings.language.system") : LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.animate}
              onChange={(e) => onChange({ animate: e.target.checked })}
            />
            {t("settings.sparkle")}
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.space} onChange={(e) => onChange({ space: e.target.checked })} />
            {t("settings.space")}
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.glow} onChange={(e) => onChange({ glow: e.target.checked })} />
            {t("settings.glow")}
          </label>
          <div className="field confirm-remote">
            {t("settings.confirmRemote")}
            {(["fetch", "pull", "push"] as const).map((op) => (
              <label key={op} className="check inline">
                <input
                  type="checkbox"
                  checked={settings.confirmRemote[op]}
                  onChange={(e) => onChange({ confirmRemote: { ...settings.confirmRemote, [op]: e.target.checked } })}
                />
                {op[0].toUpperCase() + op.slice(1)}
              </label>
            ))}
          </div>
          <label className="field">
            {t("settings.page")}
            <select value={settings.historyPage} onChange={(e) => onChange({ historyPage: Number(e.target.value) })}>
              {HISTORY_PAGES.map((n) => (
                <option key={n} value={n}>
                  {t("settings.pageN", { n: n.toLocaleString() })}
                </option>
              ))}
            </select>
          </label>
        </section>

        <ProfilesSection profiles={settings.profiles} onProfiles={(profiles) => onChange({ profiles })} />

        <LicenseSection />

        <section>
          <h4>git</h4>
          <label className="field">
            {t("settings.gitPath")}
            <input
              className="text"
              placeholder={t("settings.gitPath.placeholder")}
              value={gitPath}
              onChange={(e) => {
                setGitPath(e.target.value);
                setGitStatus(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void applyGit()}
            />
            <button disabled={checking} onClick={() => void applyGit()}>
              {t("settings.gitPath.apply")}
            </button>
          </label>
          {gitStatus && <p className={`note ${gitStatus.ok ? "" : "warn"}`}>{gitStatus.text}</p>}
          <p className="muted small">
            <Rich k="settings.gitPath.hint" />
          </p>
        </section>

        <section>
          <h4>{t("settings.shortcuts")}</h4>
          <div className="shortcuts">
            {SHORTCUTS.map((g) => (
              <table key={g.group}>
                <caption>{t(g.group)}</caption>
                <tbody>
                  {g.items.map((s) => (
                    <tr key={s.keys}>
                      <td>
                        <kbd>{label(s.keys)}</kbd>
                      </td>
                      <td>{label(s.what)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>

        <div className="dialog-actions">
          <button className="primary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
