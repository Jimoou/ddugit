import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { copyText } from "../share";
import { Rich } from "../i18n/Rich";
import { sshHostOf, sshKeysPage } from "../sshUrl";
import type { HostKey, SshStatus, SshTest } from "../types";
import { Icon } from "./Icon";

/**
 * Getting SSH ready for one address, step by step inside the app: a key (made
 * here if there is none), its public half on the forge, the server's host key
 * trusted (checked against the fingerprints the forge publishes), then a test.
 */
export function SshSetup({ url, onOpenUrl }: { url: string; onOpenUrl(url: string): void }) {
  const host = sshHostOf(url) ?? "";
  const [status, setStatus] = useState<SshStatus | null>(null);
  const [hostKey, setHostKey] = useState<HostKey | null>(null);
  const [test, setTest] = useState<SshTest | null>(null);
  const [busy, setBusy] = useState<"key" | "host" | "trust" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    api.sshStatus().then(
      (s) => live && setStatus(s),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  const step = async <T,>(which: typeof busy, f: () => Promise<T>): Promise<T | null> => {
    setBusy(which);
    setError(null);
    try {
      return await f();
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };
  const key = status?.keys[0] ?? null;
  const page = sshKeysPage(host);

  if (status && !status.available) return <p className="note warn">{t("ssh.noOpenssh")}</p>;
  return (
    <div className="ssh-setup">
      <ol>
        <li className={key ? "done" : ""}>
          <span className="what">{t("ssh.step.key")}</span>
          {!status ? (
            <span className="muted">…</span>
          ) : key ? (
            <span className="muted">
              <code>~/.ssh/{key.name}</code>
            </span>
          ) : (
            <button
              disabled={!!busy}
              onClick={() =>
                void step("key", async () => {
                  await api.sshKeygen(`ddugit@${host || "git"}`);
                  setStatus(await api.sshStatus());
                })
              }
            >
              {busy === "key" ? t("ssh.making") : t("ssh.make")}
            </button>
          )}
          {!status?.keys.length && status && <span className="muted small">{t("ssh.make.note")}</span>}
        </li>
        <li className={key ? "" : "later"}>
          <span className="what">
            <Rich k="ssh.step.add" vars={{ host }} />
          </span>
          {key && (
            <span className="row">
              <button
                onClick={() => {
                  copyText(key.public, () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? t("ssh.copied") : t("ssh.copy")}
              </button>
              {page && (
                <button onClick={() => onOpenUrl(page)}>
                  {t("ssh.openPage", { host })} <Icon name="external" size={12} />
                </button>
              )}
            </span>
          )}
        </li>
        <li className={hostKey?.known ? "done" : ""}>
          <span className="what">
            <Rich k="ssh.step.host" vars={{ host }} />
          </span>
          {!hostKey ? (
            <button
              disabled={!!busy}
              onClick={() => void step("host", async () => setHostKey(await api.sshHostKey(url)))}
            >
              {busy === "host" ? t("ssh.checking") : t("ssh.checkHost")}
            </button>
          ) : (
            <div className="host-key">
              {hostKey.fingerprints.map((f) => (
                <code key={f}>{f}</code>
              ))}
              {hostKey.verified === true && <span className="ok">{t("ssh.verified", { host })}</span>}
              {hostKey.verified === false && <span className="note warn">{t("ssh.mismatch", { host })}</span>}
              {hostKey.verified === null && !hostKey.known && <span className="muted small">{t("ssh.compare")}</span>}
              {hostKey.known ? (
                <span className="ok">{t("ssh.known")}</span>
              ) : (
                hostKey.verified !== false && (
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void step("trust", async () => {
                        await api.sshTrustHost(url, hostKey.fingerprints);
                        setHostKey({ ...hostKey, known: true });
                      })
                    }
                  >
                    {t("ssh.trust")}
                  </button>
                )
              )}
            </div>
          )}
        </li>
        <li className={test?.ok ? "done" : ""}>
          <span className="what">{t("ssh.step.test")}</span>
          <button disabled={!!busy} onClick={() => void step("test", async () => setTest(await api.sshTest(url)))}>
            {busy === "test" ? t("ssh.testing") : t("ssh.test")}
          </button>
          {test?.ok && <span className="ok">{test.user ? t("ssh.okAs", { user: test.user }) : t("ssh.ok")}</span>}
          {test && !test.ok && <pre className="note warn raw">{test.output || t("ssh.failed")}</pre>}
        </li>
      </ol>
      {error && <pre className="note warn raw">{error}</pre>}
    </div>
  );
}
