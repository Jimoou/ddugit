import { useState } from "react";

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
type Step = { text: string; cmd?: string };

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
      text: "macOS 키체인에 자격 증명을 저장하도록 설정합니다.",
      cmd: "git config --global credential.helper osxkeychain",
    },
    {
      text: "터미널에서 한 번 직접 받아 로그인합니다. GitHub는 비밀번호 대신 Personal Access Token을 입력합니다.",
      cmd: 'git -C "{repo}" fetch',
    },
    { text: "GitHub CLI가 있다면 이 명령 하나로 대신할 수 있어요.", cmd: "gh auth login" },
  ],
  "https:windows": [
    {
      text: "Git for Windows의 Git Credential Manager를 사용하도록 설정합니다.",
      cmd: "git config --global credential.helper manager",
    },
    { text: "아래 '다시 시도'를 누르면 브라우저 로그인 창이 열립니다. 한 번 로그인하면 저장돼요." },
  ],
  "https:linux": [
    {
      text: "자격 증명 저장소를 설정합니다 (libsecret이 없으면 `store`를 쓰되, 평문 저장이라는 점에 주의하세요).",
      cmd: "git config --global credential.helper libsecret",
    },
    { text: "터미널에서 한 번 직접 받아 로그인합니다.", cmd: 'git -C "{repo}" fetch' },
  ],
  "ssh-host": [
    {
      text: "이 서버를 처음 접속해서 호스트 키가 등록되지 않았어요. 터미널에서 한 번 접속해 yes로 답합니다.",
      cmd: "ssh -T git@{host}",
    },
  ],
  "ssh:mac": [
    { text: "키가 없다면 새로 만듭니다.", cmd: 'ssh-keygen -t ed25519 -C "you@example.com"' },
    { text: "키를 에이전트와 키체인에 등록합니다.", cmd: "ssh-add --apple-use-keychain ~/.ssh/id_ed25519" },
    { text: "공개키를 {host} 계정 설정(SSH keys)에 추가합니다.", cmd: "pbcopy < ~/.ssh/id_ed25519.pub" },
    { text: "연결을 확인합니다.", cmd: "ssh -T git@{host}" },
  ],
  "ssh:windows": [
    { text: "키가 없다면 새로 만듭니다 (PowerShell).", cmd: 'ssh-keygen -t ed25519 -C "you@example.com"' },
    {
      text: "OpenSSH 에이전트를 켜고 키를 등록합니다 (관리자 PowerShell).",
      cmd: "Get-Service ssh-agent | Set-Service -StartupType Automatic; Start-Service ssh-agent; ssh-add $env:USERPROFILE\\.ssh\\id_ed25519",
    },
    {
      text: "공개키를 {host} 계정 설정(SSH keys)에 추가합니다.",
      cmd: "Get-Content $env:USERPROFILE\\.ssh\\id_ed25519.pub | Set-Clipboard",
    },
    { text: "연결을 확인합니다.", cmd: "ssh -T git@{host}" },
  ],
  "ssh:linux": [
    { text: "키가 없다면 새로 만듭니다.", cmd: 'ssh-keygen -t ed25519 -C "you@example.com"' },
    { text: "에이전트에 키를 등록합니다.", cmd: 'eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519' },
    { text: "공개키를 {host} 계정 설정(SSH keys)에 추가합니다.", cmd: "cat ~/.ssh/id_ed25519.pub" },
    { text: "연결을 확인합니다.", cmd: "ssh -T git@{host}" },
  ],
};

export function AuthDialog({ url, output, repoPath, busy, onRetry, onClose }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  const ssh = isSsh(url, output);
  const host = hostOf(url);
  const key = ssh ? (/Host key/i.test(output) ? "ssh-host" : `ssh:${os}`) : `https:${os}`;
  const fill = (t: string) => t.replaceAll("{host}", host).replaceAll("{repo}", repoPath);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog auth" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">인증 필요</div>
        <p>
          <b>{host}</b>에 {ssh ? "SSH 키로" : "HTTPS로"} 접속하지 못했어요. otgit은 숨은 입력창에서 멈추지 않도록 터미널
          로그인 프롬프트를 띄우지 않습니다. 아래를 한 번만 설정하면 이후에는 바로 동작해요.
        </p>
        {url && <code className="url">{url}</code>}
        <ol className="steps">
          {GUIDES[key].map((s, i) => (
            <li key={i}>
              <span>{fill(s.text)}</span>
              {s.cmd && (
                <div className="cmd">
                  <code>{fill(s.cmd)}</code>
                  <button
                    className="icon"
                    title="복사"
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
          <summary className="muted">git 출력 보기</summary>
          <pre className="raw">{output}</pre>
        </details>
        <div className="dialog-actions">
          <button onClick={onClose}>닫기</button>
          <button className="primary" disabled={busy} onClick={onRetry}>
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
