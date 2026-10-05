// Add a remote by URL, or by picking one of your repositories on GitHub / GitLab.

import { useState } from "react";
import { remoteNameFor, type Source } from "../forgeRepos";
import { t } from "../i18n";
import { ForgeRepoPicker, type Picked, SourceTabs } from "./ForgeRepoPicker";
import { closeOnScrim, useDialog } from "./useDialog";

interface Props {
  path: string;
  /** Names already taken (the placeholder suggests `upstream` until it is). */
  remotes: string[];
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
      placeholder={p.remotes.includes("upstream") ? undefined : "upstream"}
      value={name}
      onChange={(e) => setTypedName(e.target.value.replace(/\s+/g, "-"))}
    />
  );
  const dialog = useDialog(p.onCancel);
  return (
    <div className="scrim" {...closeOnScrim(p.onCancel)}>
      <form
        className="dialog add-remote"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) p.onSubmit(name.trim(), url.trim());
        }}
        {...dialog}
      >
        <h2 className="dialog-title">{t("remote.add.title")}</h2>
        <div className="source-body">
          <SourceTabs
            value={source}
            onChange={(s) => {
              setSource(s);
              setTypedName(null);
              setPicked(null);
            }}
          />
          <div className="source-pane">
            {source !== "url" && (
              <ForgeRepoPicker
                key={source}
                kind={source}
                path={p.path}
                picked={picked}
                onPick={(pk) => {
                  setPicked(pk);
                  setTypedName(null);
                }}
              />
            )}
            <label className="field col">
              {t("remote.add.name")}
              {nameField}
            </label>
            {source === "url" ? (
              <label className="field col">
                {t("remote.add.urlLabel")}
                <input
                  className="text"
                  placeholder={t("remote.add.url")}
                  value={typedUrl}
                  onChange={(e) => setTypedUrl(e.target.value)}
                />
              </label>
            ) : (
              picked && <p className="muted small add-remote-url">→ {picked.url}</p>
            )}
          </div>
        </div>
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
