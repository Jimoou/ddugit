import { Icon } from "./Icon";
import { useCallback, useState } from "react";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { complete, current, MISSIONS, type MissionId, NEW_VOYAGE, parseVoyage, type Voyage } from "../missions";
import { readStored, writeStored } from "../storage";

const KEY = "ddugit.voyage";

const load = (): Voyage => parseVoyage(readStored(KEY));
const save = (v: Voyage) => writeStored(KEY, JSON.stringify(v));

/** Tutorial progress (only on the demo repository); `mission` marks one done. */
export function useVoyage(enabled: boolean) {
  const [voyage, setVoyage] = useState<Voyage>(load);
  /** The mission finished last, for its short celebration. */
  const [just, setJust] = useState<MissionId | null>(null);
  const update = useCallback((next: (v: Voyage) => Voyage) => {
    setVoyage((v) => {
      const n = next(v);
      if (n !== v) save(n);
      return n;
    });
  }, []);
  const mission = useCallback(
    (id: MissionId) => {
      if (!enabled) return;
      update((v) => {
        if (v.done.includes(id) || v.dismissed) return v;
        setJust(id);
        return complete(v, id);
      });
    },
    [enabled, update],
  );
  return {
    voyage,
    just,
    shown: enabled && !voyage.dismissed,
    mission,
    dismiss: () => update((v) => ({ ...v, dismissed: true })),
    reopen: () => update((v) => ({ ...v, dismissed: false })),
    restart: () => update(() => NEW_VOYAGE),
  };
}

/** The voyage log over the graph: missions in order, the current one with how to do it. */
export function MissionPanel(p: {
  voyage: Voyage;
  just: MissionId | null;
  onDismiss(): void;
  onRestart(): void;
  onOpenRepo(): void;
}) {
  const [folded, setFolded] = useState(false);
  const next = current(p.voyage);
  return (
    <aside className={`voyage ${folded ? "folded" : ""}`} aria-label={t("voyage.title")}>
      <header>
        <span className="eyebrow">
          <Icon name="sparkle" size={12} /> {t("voyage.title")}
        </span>
        <span className="muted">
          {p.voyage.done.length} / {MISSIONS.length}
        </span>
        <span className="spacer" />
        <button
          className="icon"
          onClick={() => setFolded((f) => !f)}
          aria-label={folded ? t("voyage.unfold") : t("voyage.fold")}
          title={folded ? t("voyage.unfold") : t("voyage.fold")}
        >
          <Icon name={folded ? "chevronUp" : "chevronDown"} />
        </button>
        <button className="icon" onClick={p.onDismiss} aria-label={t("common.close")} title={t("voyage.close")}>
          <Icon name="close" />
        </button>
      </header>
      {!folded && (
        <>
          <ol>
            {MISSIONS.map((m) => {
              const done = p.voyage.done.includes(m);
              return (
                <li
                  key={m}
                  className={`${done ? "done" : ""} ${m === next ? "now" : ""} ${m === p.just ? "just" : ""}`}
                >
                  <span className="mark">
                    <Icon name="star" size={13} filled={done} />
                  </span>
                  <span className="what">
                    {t(`voyage.${m}`)}
                    {m === next && (
                      <span className="how">
                        <Rich k={`voyage.${m}.how`} />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {!next && (
            <div className="voyage-end">
              <p>{t("voyage.end")}</p>
              <div className="row">
                <button className="primary" onClick={p.onOpenRepo}>
                  {t("voyage.openRepo")}
                </button>
                <button onClick={p.onRestart}>{t("voyage.again")}</button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
