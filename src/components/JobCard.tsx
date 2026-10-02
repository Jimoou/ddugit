import { isKey, t } from "../i18n";
import type { Progress } from "../types";

/** git's progress phase, translated when known. */
export const phase = (name: string) => {
  const key = `progress.${name}`;
  return isKey(key) ? t(key) : name;
};

/**
 * A long remote operation in progress (fetch, pull, push, a remote just added):
 * a card over the bottom of the window with git's phase and a bar. It fades in
 * after a moment, so quick operations don't flash it.
 */
export function JobCard({ title, progress }: { title: string; progress: Progress | null }) {
  return (
    <div className="job-card" role="status" aria-live="polite">
      <div className="job-title">{title}</div>
      <div className="job-phase muted">
        {progress ? `${phase(progress.phase)} ${progress.percent}%` : t("job.starting")}
      </div>
      <div className={`job-bar ${progress ? "" : "waiting"}`}>
        <i style={{ width: `${progress?.percent ?? 0}%` }} />
      </div>
    </div>
  );
}
