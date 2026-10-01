import { useState } from "react";
import { type Key, t } from "../i18n";
import { Rich } from "../i18n/Rich";

interface Props {
  /** Remote URL the operation talked to. */
  url: string | null;
  /** git's output, used to tell "unknown host key" from "no key". */
  output: string;
  repoPath: string;
  busy: boolean;
  onRetry(): void;
  onClose(): void;
}

type Os = "mac" | "windows" | "linux";
type Step = { text: Key; cmd?: string };

const os: Os = /Mac/i.test(navigator.userAgent) ? "mac" : /Win/i.test(navigator.userAgent) ? "windows" : "linux";

const isSsh = (url: string | null, output: string) =>
  /^(ssh:\/\/|[\w.-]+@[\w.-]+:)/.test(url ?? "") || /publickey|Host key/i.test(output);

/** `git@github.com:me/x.git`, `ssh://git@host:22/x`, `https://host/x` → `host`. */
function hostOf(url: string | null): string {
  if (!url) return "github.com";
  const m = url.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)/i);
  return m?.[1] ?? "github.com";
}

/** Setup steps per transport and OS. `{host}` / `{repo}` are filled in. */
const GUIDES: Record<string, Step[]> = {
  "https:mac": [
    {
      text: "auth.mac.keychain",
      cmd: "git config --global credential.helper osxkeychain",
    },
    {
      text: "auth.mac.login",
      cmd: 'git -C "{repo}" fetch',
    },
    { text: "auth.mac.gh", cmd: "gh auth login" },
  ],
  "https:windows": [
    {
      text: "auth.win.gcm",
      cmd: "git config --global credential.helper manager",
    },
    { text: "auth.win.retry" },
  ],
  "https:linux": [
    {
      text: "auth.linux.helper",
      cmd: "git config --global credential.helper libsecret",
    },
    { text: "auth.linux.login", cmd: 'git -C "{repo}" fetch' },
  ],
  "ssh-host": [
    {
      text: "auth.ssh.hostKey",
      cmd: "ssh -T git@{host}",
    },
  ],
  "ssh:mac": [
    { text: "auth.ssh.keygen", cmd: 'ssh-keygen -t ed25519 -C "you@example.com"' },
    { text: "auth.ssh.agentMac", cmd: "ssh-add --apple-use-keychain ~/.ssh/id_ed25519" },
    { text: "auth.ssh.addKey", cmd: "pbcopy < ~/.ssh/id_ed25519.pub" },
    { text: "auth.ssh.test", cmd: "ssh -T git@{host}" },
  ],
  "ssh:windows": [
    { text: "auth.ssh.keygenWin", cmd: 'ssh-keygen -t ed25519 -C "you@example.com"' },
    {
      text: "auth.ssh.agentWin",
      cmd: "Get-Service ssh-agent | Set-Service -StartupType Automatic; Start-Service ssh-agent; ssh-add $env:USERPROFILE\\.ssh\\id_ed25519",
    },
    {
      text: "auth.ssh.addKey",
      cmd: "Get-Content $env:USERPROFILE\\.ssh\\id_ed25519.pub | Set-Clipboard",
    },
    { text: "auth.ssh.test", cmd: "ssh -T git@{host}" },
  ],
  "ssh:linux": [
    { text: "auth.ssh.keygen", cmd: 'ssh-keygen -t ed25519 -C "you@example.com"' },
    { text: "auth.ssh.agent", cmd: 'eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519' },
    { text: "auth.ssh.addKey", cmd: "cat ~/.ssh/id_ed25519.pub" },
    { text: "auth.ssh.test", cmd: "ssh -T git@{host}" },
  ],
};

export function AuthDialog({ url, output, repoPath, busy, onRetry, onClose }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  const ssh = isSsh(url, output);
  const host = hostOf(url);
  const key = ssh ? (/Host key/i.test(output) ? "ssh-host" : `ssh:${os}`) : `https:${os}`;
  const fill = (s: string) => s.replaceAll("{host}", host).replaceAll("{repo}", repoPath);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog auth" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{t("auth.title")}</div>
        <p>
          <Rich k={ssh ? "auth.bodySsh" : "auth.bodyHttps"} vars={{ host }} />
        </p>
        {url && <code className="url">{url}</code>}
        <ol className="steps">
          {GUIDES[key].map((s, i) => (
            <li key={i}>
              <span>{fill(t(s.text))}</span>
              {s.cmd && (
                <div className="cmd">
                  <code>{fill(s.cmd)}</code>
                  <button
                    className="icon"
                    title={t("auth.copy")}
                    onClick={() => {
                      void navigator.clipboard?.writeText(fill(s.cmd!));
                      setCopied(i);
                    }}
                  >
                    {copied === i ? "✓" : "⧉"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        <details>
          <summary className="muted">{t("auth.output")}</summary>
          <pre className="raw">{output}</pre>
        </details>
        <div className="dialog-actions">
          <button onClick={onClose}>{t("common.close")}</button>
          <button className="primary" disabled={busy} onClick={onRetry}>
            {t("auth.retry")}
          </button>
        </div>
      </div>
    </div>
  );
}
