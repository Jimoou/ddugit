import { useState } from "react";
import { api } from "../api";
import { EDITOR_CHOICES, type ExternalApps, toolNames } from "../external";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { useLoaded } from "./useLoaded";

interface Props {
  apps: ExternalApps;
  onChange(patch: Partial<ExternalApps>): void;
}

const CUSTOM = "custom";

/** Settings → External apps: the editor files open in, and git's diff / merge tools. */
export function ExternalSection({ apps, onChange }: Props) {
  const knownEditor = apps.editor === "" || EDITOR_CHOICES.some((c) => c.value === apps.editor);
  const [custom, setCustom] = useState(!knownEditor);
  const [typed, setTyped] = useState(knownEditor ? "" : apps.editor);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const tools = useLoaded("tools", () => api.toolSetup()).data;

  /** Keep `editor` once the backend has taken it (it says where the program is). */
  const applyEditor = async (editor: string) => {
    try {
      const at = await api.setEditor(editor, t("settings.editor.confirm"));
      if (!editor.trim()) {
        setStatus(null);
        return onChange({ editor: "" });
      }
      setStatus({ ok: true, text: at });
      onChange({ editor: editor.trim() });
    } catch (e) {
      setStatus({ ok: false, text: String(e) });
    }
  };

  const toolSelect = (id: string, key: "diffTool" | "mergeTool") => {
    const configured = key === "diffTool" ? tools?.diff : tools?.merge;
    const names = toolNames(
      (key === "diffTool" ? tools?.customDiff : tools?.customMerge) ?? [],
      tools?.known ?? [],
      apps[key],
    );
    return (
      <select id={id} value={apps[key]} onChange={(e) => onChange({ [key]: e.target.value })}>
        <option value="">
          {configured ? t("settings.tool.git", { tool: configured }) : t("settings.tool.gitNone")}
        </option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    );
  };

  return (
    <section>
      <h4>{t("settings.external")}</h4>
      <div className="settings-form">
        <label htmlFor="settings-editor">{t("settings.editor")}</label>
        <select
          id="settings-editor"
          value={custom ? CUSTOM : apps.editor}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v === CUSTOM);
            setStatus(null);
            if (v !== CUSTOM) void applyEditor(v);
          }}
        >
          <option value="">{t("settings.editor.default")}</option>
          {EDITOR_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
          <option value={CUSTOM}>{t("settings.editor.custom")}</option>
        </select>
        <label htmlFor="settings-diff-tool">{t("settings.diffTool")}</label>
        {toolSelect("settings-diff-tool", "diffTool")}
        <label htmlFor="settings-merge-tool">{t("settings.mergeTool")}</label>
        {toolSelect("settings-merge-tool", "mergeTool")}
      </div>
      {custom && (
        <label className="field">
          {t("settings.editor.custom")}
          <input
            className="text"
            placeholder={t("settings.editor.placeholder")}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setStatus(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void applyEditor(typed)}
          />
          <button onClick={() => void applyEditor(typed)}>{t("settings.gitPath.apply")}</button>
        </label>
      )}
      {status && <p className={`note ${status.ok ? "" : "warn"}`}>{status.text}</p>}
      <p className="muted small">{t("settings.editor.hint")}</p>
      <p className="muted small">
        <Rich k="settings.tool.hint" />
      </p>
    </section>
  );
}
