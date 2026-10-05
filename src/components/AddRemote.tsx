// Add a remote by URL, or by picking one of your repositories on GitHub / GitLab.

import { useState } from "react";
import { remoteNameFor, type Source } from "../forgeRepos";
import { t } from "../i18n";
import { ForgeRepoPicker, type Picked, SourceTabs } from "./ForgeRepoPicker";

interface Props {
  path: string;
  /** Names already taken (the placeholder suggests `upstream` until it is). */
  remotes: string[];
  trusted: string[];
  onTrust(host: string): void;
  busy: boolean;
  onSubmit(name: string, url: string): void;
  onCancel(): void;
}

export function AddRemoteDialog(p: Props) {
  const [source, setSource] = useState<Source>("url");
  const [typedName, setTypedName] = useState<string | null>(null);
  const [typedUrl, setTypedUrl] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  // A picked repository names the remote after its owner until the name is edited.
  const name = typedName ?? (source !== "url" && picked ? remoteNameFor(picked.repo.fullName) : "");
  const url = source === "url" ? typedUrl : (picked?.url ?? "");
  const ok = name.trim() !== "" && url.trim() !== "" && !p.busy;
  const nameField = (
    <input
      className="text"
      autoFocus={source === "url"}
      aria-label={t("remote.add.name")}
      placeholder={p.remotes.includes("upstream") ? t("remote.add.name") : t("remote.add.nameExample")}
      value={name}
      onChange={(e) => setTypedName(e.target.value.replace(/\s+/g, "-"))}
    />
  );
  return (
    <div className="scrim" onClick={p.onCancel}>
      <form
        className="dialog add-remote"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) p.onSubmit(name.trim(), url.trim());
        }}
        onKeyDown={(e) => e.key === "Escape" && p.onCancel()}
      >
        <div className="eyebrow">{t("remote.add.title")}</div>
        <SourceTabs
          value={source}
          onChange={(s) => {
            setSource(s);
            setTypedName(null);
            setPicked(null);
          }}
        />
        {source === "url" ? (
          <>
            {nameField}
            <input
              className="text"
              aria-label={t("remote.add.urlLabel")}
              placeholder={t("remote.add.url")}
              value={typedUrl}
              onChange={(e) => setTypedUrl(e.target.value)}
            />
          </>
        ) : (
          <>
            <ForgeRepoPicker
              key={source}
              kind={source}
              path={p.path}
              trusted={p.trusted}
              onTrust={p.onTrust}
              picked={picked}
              onPick={(pk) => {
                setPicked(pk);
                setTypedName(null);
              }}
            />
            <label className="field col">
              {t("remote.add.name")}
              {nameField}
            </label>
            {picked && <p className="muted small add-remote-url">→ {picked.url}</p>}
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={p.onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {t("remote.add.go")}
          </button>
        </div>
      </form>
    </div>
  );
}
