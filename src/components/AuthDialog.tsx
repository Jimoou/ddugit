import { Icon } from "./Icon";
import { SshSetup } from "./SshSetup";
import { api } from "../api";
import { useState } from "react";
import { type Key, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { useDialog } from "./useDialog";
import { safeHost, shellCommand, shellOf } from "../shell";

interface Props {
  /** Remote URL the operation talked to. */
  url: string | null;
  /** git's output, used to tell "unknown host key" from "no key". */
  output: string;
  repoPath: string;
  /** The command (as words) that signs in once from a terminal; defaults to fetching `repoPath`. */
  signIn?: string[];
  busy: boolean;
  onRetry(): void;
  onClose(): void;
}

type Os = "mac" | "windows" | "linux";
type Step = { text: Key; cmd?: string };

const os: Os = /Mac/i.test(navigator.userAgent) ? "mac" : /Win/i.test(navigator.userAgent) ? "windows" : "linux";
const shell = shellOf(navigator.userAgent);

const isSsh = (url: string | null, output: string) =>
  /^(ssh:\/\/|[\w.-]+@[\w.-]+:)/.test(url ?? "") || /publickey|Host key/i.test(output);

/** `git@github.com:me/x.git`, `ssh://git@host:22/x`, `https://host/x` → `host`. */
function hostOf(url: string | null): string {
  if (!url) return "github.com";
  const m = url.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)/i);
  return m?.[1] ?? "github.com";
}

/** Setup steps per transport and OS. `{host}` / `{fetch}` are filled in. */
const GUIDES: Record<string, Step[]> = {
  "https:mac": [
    {
      text: "auth.mac.keychain",
      cmd: "git config --global credential.helper osxkeychain",
    },
    {
      text: "auth.mac.login",
      cmd: "{fetch}",
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
    { text: "auth.linux.login", cmd: "{fetch}" },
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

export function AuthDialog({ url, output, repoPath, signIn, busy, onRetry, onClose }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  const ssh = isSsh(url, output);
  const host = hostOf(url);
  const key = ssh ? (/Host key/i.test(output) ? "ssh-host" : `ssh:${os}`) : `https:${os}`;
  // Paths and URLs are quoted for the terminal; a host that isn't a plain name leaves its commands out.
  const signInCmd = shellCommand(signIn ?? ["git", "-C", repoPath, "fetch"], shell);
  const cmdHost = safeHost(host);
  const fill = (s: string) => s.replaceAll("{host}", host);
  const command = (cmd: string | undefined) =>
    cmd && (cmdHost || !cmd.includes("{host}"))
      ? cmd.replaceAll("{host}", cmdHost ?? "").replaceAll("{fetch}", signInCmd)
      : null;
  const steps = (
    <ol className="steps">
      {GUIDES[key].map((s, i) => {
        const cmd = command(s.cmd);
        return (
          <li key={i}>
            <span>{fill(t(s.text))}</span>
            {cmd && (
              <div className="cmd">
                <code>{cmd}</code>
                <button
                  className="icon"
                  title={t("auth.copy")}
                  onClick={() => {
                    void navigator.clipboard?.writeText(cmd);
                    setCopied(i);
                  }}
                >
                  <Icon name={copied === i ? "check" : "copy"} />
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );

  const dialog = useDialog(onClose);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog auth" onClick={(e) => e.stopPropagation()} {...dialog}>
        <h2 className="dialog-title">{t("auth.title")}</h2>
        <p>
          <Rich k={ssh ? "auth.bodySsh" : "auth.bodyHttps"} vars={{ host }} />
        </p>
        {url && <code className="url">{url}</code>}
        {ssh && url && /Host key|publickey/i.test(output) ? (
          // Set SSH up right here; the terminal route stays one click away.
          <>
            <SshSetup url={url} onOpenUrl={(u) => void api.openUrl("", u)} />
            <details>
              <summary className="muted">{t("ssh.terminal")}</summary>
              {steps}
            </details>
          </>
        ) : (
          steps
        )}
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
