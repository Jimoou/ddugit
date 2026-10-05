import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtAgo } from "../format";
import { t } from "../i18n";
import { offerPro, proOpen, usePro } from "../pro";
import type { BundleCheck, OpResult, TransferSent } from "../types";
import { guessName } from "../transfer";
import { ProBadge } from "./ProOffer";
import { Segmented } from "./Segmented";
import { Modal } from "./Modal";

/**
 * Air-gapped transfer (Pro): write a bundle of what a destination doesn't have yet,
 * or check and import one that came in. Looking (history, checking a bundle) is Free.
 */
export function TransferDialog(p: {
  path: string;
  branches: string[];
  head: string | null;
  busy: boolean;
  run(label: string, op: () => Promise<OpResult>): Promise<OpResult>;
  onClose(): void;
}) {
  const pro = proOpen(usePro());
  const [tab, setTab] = useState<"out" | "in">("out");
  const [history, setHistory] = useState<TransferSent[]>([]);
  const [dest, setDest] = useState("");
  const [picked, setPicked] = useState<string[]>(p.head ? [p.head] : []);
  const [full, setFull] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [check, setCheck] = useState<BundleCheck | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => void api.transferHistory(p.path).then(setHistory, () => {});
  useEffect(reload, [p.path]);

  const dests = [...new Set(history.map((h) => h.dest))];
  const lastFor = (branch: string) => history.find((h) => h.dest === dest.trim() && h.branch === branch);

  const exportNow = async () => {
    if (!pro) return offerPro("transfer");
    const outDir = await api.pickFolder(t("tr.pickOut"));
    if (!outDir) return;
    const r = await p.run(t("tr.exported", { dest: dest.trim() }), () =>
      api.transferExport(p.path, { dest: dest.trim(), branches: picked, full, outDir }),
    );
    if (r.status === "ok") reload();
  };

  const pickBundle = async () => {
    setError(null);
    setCheck(null);
    const f = await api.pickBundle(t("tr.pickIn"));
    if (!f) return;
    setFile(f);
    if (!name) setName(guessName(f, p.path));
    api.transferCheck(p.path, f).then(setCheck, (e) => setError(String(e)));
  };

  const importNow = async () => {
    if (!pro) return offerPro("transfer");
    if (!file) return;
    const r = await p.run(t("tr.imported", { name: name.trim() }), () => api.transferImport(p.path, file, name.trim()));
    if (r.status === "ok") p.onClose();
  };

  return (
    <Modal
      onClose={p.onClose}
      className="transfer"
      label={t("tr.title")}
      title={
        <>
          {t("tr.title")} {!pro && <ProBadge />}
        </>
      }
    >
      <Segmented
        role="tablist"
        label={t("tr.title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "out", label: t("tr.out") },
          { value: "in", label: t("tr.in") },
        ]}
      />

      {tab === "out" ? (
        <>
          <p className="muted small">{t("tr.outHint")}</p>
          <label className="field col">
            <span>{t("tr.dest")}</span>
            <input
              className="text"
              list="transfer-dests"
              value={dest}
              placeholder={t("tr.destPlaceholder")}
              onChange={(e) => setDest(e.target.value)}
            />
            <datalist id="transfer-dests">
              {dests.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <div className="tr-branches" role="group" aria-label={t("tr.branches")}>
            {p.branches.map((b) => {
              const last = lastFor(b);
              return (
                <label key={b} className="check">
                  <input
                    type="checkbox"
                    checked={picked.includes(b)}
                    onChange={() => setPicked((ps) => (ps.includes(b) ? ps.filter((x) => x !== b) : [...ps, b]))}
                  />
                  <span className="mono">{b}</span>
                  <span className="muted small">
                    {last && !full
                      ? t("tr.since", { id: last.tip.slice(0, 7), ago: fmtAgo(last.time) })
                      : t("tr.everything")}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="check">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
            <span>{t("tr.full")}</span>
          </label>
          <div className="dialog-actions">
            <button onClick={p.onClose}>{t("common.close")}</button>
            <button
              className="primary"
              disabled={p.busy || !dest.trim() || picked.length === 0}
              onClick={() => void exportNow()}
            >
              {t("tr.export")} {!pro && <ProBadge />}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">{t("tr.inHint")}</p>
          <div className="field col">
            <span>{t("tr.pickIn")}</span>
            <span className="row">
              <code className="folder" title={file ?? undefined}>
                {file ?? t("tr.noFile")}
              </code>
              <button onClick={() => void pickBundle()}>{t("tr.pick")}</button>
            </span>
          </div>
          {check && (
            <div className="tr-check">
              <p className={check.checksum === "mismatch" ? "note warn" : "muted small"}>
                {t(`tr.sum.${check.checksum}`)}
              </p>
              {check.missing.length > 0 && <p className="note warn">{t("tr.missing", { n: check.missing.length })}</p>}
              <ul className="tr-heads">
                {check.heads.map((h) => (
                  <li key={h.name} className="mono small">
                    {h.name.replace(/^refs\/heads\//, "")} <span className="muted">{h.id.slice(0, 7)}</span>
                  </li>
                ))}
              </ul>
              <label className="field col">
                <span>{t("tr.as")}</span>
                <input className="text" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </div>
          )}
          {error && <p className="note warn">{error}</p>}
          <div className="dialog-actions">
            <button onClick={p.onClose}>{t("common.close")}</button>
            <button
              className="primary"
              disabled={p.busy || !check?.ok || !name.trim()}
              onClick={() => void importNow()}
            >
              {t("tr.import")} {!pro && <ProBadge />}
            </button>
          </div>
        </>
      )}

      {history.length > 0 && tab === "out" && (
        <details className="tr-history">
          <summary>{t("tr.history", { n: dests.length })}</summary>
          <ul>
            {history.map((h) => (
              <li key={`${h.dest}:${h.branch}`} className="small">
                <b>{h.dest}</b> · <span className="mono">{h.branch}</span>{" "}
                <span className="muted">
                  {h.tip.slice(0, 7)} · {fmtAgo(h.time)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}
