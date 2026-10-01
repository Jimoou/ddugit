import { useEffect, useState } from "react";
import { api } from "../api";
import { HISTORY_PAGES, type Settings, SHORTCUTS } from "../settings";

interface Props {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
}

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
      <div className="dialog settings" role="dialog" aria-label="설정" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">설정</div>

        <section>
          <h4>화면</h4>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.animate}
              onChange={(e) => onChange({ animate: e.target.checked })}
            />
            반짝임 효과 (선을 따라 흐르는 빛, 새 커밋 터짐)
          </label>
          <label className="field">
            한 번에 불러올 커밋
            <select value={settings.historyPage} onChange={(e) => onChange({ historyPage: Number(e.target.value) })}>
              {HISTORY_PAGES.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}개
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h4>git</h4>
          <label className="field">
            실행 파일
            <input
              className="text"
              placeholder="비워 두면 PATH의 git"
              value={gitPath}
              onChange={(e) => {
                setGitPath(e.target.value);
                setGitStatus(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void applyGit()}
            />
            <button disabled={checking} onClick={() => void applyGit()}>
              확인하고 적용
            </button>
          </label>
          {gitStatus && <p className={`note ${gitStatus.ok ? "" : "warn"}`}>{gitStatus.text}</p>}
          <p className="muted small">
            macOS에서 Finder로 실행하면 터미널의 PATH를 모를 수 있어요. 이럴 때 <code>/opt/homebrew/bin/git</code>처럼
            직접 지정하세요.
          </p>
        </section>

        <section>
          <h4>단축키</h4>
          <div className="shortcuts">
            {SHORTCUTS.map((g) => (
              <table key={g.group}>
                <caption>{g.group}</caption>
                <tbody>
                  {g.items.map((s) => (
                    <tr key={s.keys}>
                      <td>
                        <kbd>{s.keys}</kbd>
                      </td>
                      <td>{s.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>

        <div className="dialog-actions">
          <button className="primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
