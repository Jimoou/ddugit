import { Fragment, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { isKey, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { HISTORY_PAGES, LANGUAGES, type Settings, SHORTCUTS } from "../settings";
import { Icon } from "./Icon";
import { ProfilesSection } from "./Identity";
import { LicenseSection } from "./License";
import { Segmented } from "./Segmented";
import { useDialog } from "./useDialog";

/** The settings, one at a time beside a list of them. */
const SETTINGS_SECTIONS = ["screen", "profiles", "license", "git", "shortcuts"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_LABEL: Record<SettingsSection, () => string> = {
  screen: () => t("settings.screen"),
  profiles: () => t("identity.profiles"),
  license: () => t("license.title"),
  git: () => "Git",
  shortcuts: () => t("settings.shortcuts"),
};

interface Props {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  /** The section to open at ("?" opens the shortcuts). */
  at: SettingsSection;
  onClose(): void;
}

/** Language names are shown in their own language so anyone can find theirs. */
const LANGUAGE_NAMES = { ko: "한국어", en: "English" } as const;

const label = (text: string) => (isKey(text) ? t(text) : text);

/** Settings plus the shortcut table (opened with ? or the ⚙ button). */
export function SettingsDialog({ settings, at, onChange, onClose }: Props) {
  const [section, setSection] = useState(at);
  const dialog = useDialog(onClose);
  // Opened at a section on purpose ("?"): its content takes focus, so reading starts there.
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (at !== "screen") pane.current?.focus({ preventScroll: true });
  }, [at]);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog settings"
        aria-label={t("settings.title")}
        onClick={(e) => e.stopPropagation()}
        {...dialog}
      >
        <header className="settings-head">
          <h2 className="dialog-title">{t("settings.title")}</h2>
          <button className="icon" onClick={onClose} title={t("common.closeEsc")} aria-label={t("common.close")}>
            <Icon name="close" />
          </button>
        </header>
        <div className="settings-body">
          <Segmented
            className="column settings-nav"
            role="tablist"
            label={t("settings.title")}
            value={section}
            onChange={setSection}
            options={SETTINGS_SECTIONS.map((id) => ({ value: id, label: SECTION_LABEL[id]() }))}
          />
          <div className="settings-pane" ref={pane} role="tabpanel" tabIndex={-1} aria-label={SECTION_LABEL[section]()}>
            {section === "screen" && <ScreenSection settings={settings} onChange={onChange} />}
            {section === "profiles" && (
              <ProfilesSection profiles={settings.profiles} onProfiles={(profiles) => onChange({ profiles })} />
            )}
            {section === "license" && <LicenseSection />}
            {section === "git" && <GitSection settings={settings} onChange={onChange} />}
            {section === "shortcuts" && <ShortcutsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

type SectionProps = Pick<Props, "settings" | "onChange">;

function ScreenSection({ settings, onChange }: SectionProps) {
  const check = (key: "animate" | "space" | "glow", text: string) => (
    <label className="check">
      <input type="checkbox" checked={settings[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
      {text}
    </label>
  );
  return (
    <section>
      <h4>{t("settings.screen")}</h4>
      <div className="settings-form">
        <label htmlFor="settings-language">{t("settings.language")}</label>
        <select
          id="settings-language"
          value={settings.language}
          onChange={(e) => onChange({ language: LANGUAGES.find((l) => l === e.target.value) ?? "system" })}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l === "system" ? t("settings.language.system") : LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
        <span>{t("settings.effects")}</span>
        <div className="checks">
          {check("animate", t("settings.sparkle"))}
          {check("space", t("settings.space"))}
          {check("glow", t("settings.glow"))}
        </div>
        <span>{t("settings.confirmRemote")}</span>
        <div className="checks">
          {(["fetch", "pull", "push"] as const).map((op) => (
            <label key={op} className="check">
              <input
                type="checkbox"
                checked={settings.confirmRemote[op]}
                onChange={(e) => onChange({ confirmRemote: { ...settings.confirmRemote, [op]: e.target.checked } })}
              />
              {op[0].toUpperCase() + op.slice(1)}
            </label>
          ))}
        </div>
        <label htmlFor="settings-page">{t("settings.page")}</label>
        <select
          id="settings-page"
          value={settings.historyPage}
          onChange={(e) => onChange({ historyPage: Number(e.target.value) })}
        >
          {HISTORY_PAGES.map((n) => (
            <option key={n} value={n}>
              {t("settings.pageN", { n: n.toLocaleString() })}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function GitSection({ settings, onChange }: SectionProps) {
  const [gitPath, setGitPath] = useState(settings.gitPath);
  const [gitStatus, setGitStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
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
    <section>
      <h4>Git</h4>
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
  );
}

/** Keys are chips (one per alternative, never broken inside); mouse gestures are plain words. */
function ShortcutsSection() {
  return (
    <section aria-label={t("settings.shortcuts")}>
      <h4>{t("settings.shortcuts")}</h4>
      <div className="shortcuts">
        {SHORTCUTS.map((g) => (
          <table key={g.group}>
            <caption>{t(g.group)}</caption>
            <tbody>
              {g.items.map((s) => (
                <tr key={s.keys}>
                  <td>
                    {isKey(s.keys) ? (
                      <span className="gesture">{t(s.keys)}</span>
                    ) : (
                      s.keys.split(" / ").map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 && " / "}
                          <kbd>{k}</kbd>
                        </Fragment>
                      ))
                    )}
                  </td>
                  <td>{label(s.what)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
