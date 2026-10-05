import { type RefObject, useRef, useState } from "react";
import { api } from "../api";
import type { Confirm } from "../components/ConfirmDialog";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { OpResult, RepoSnapshot } from "../types";
import type { Run, Toast } from "./state";

interface Options {
  path: string;
  toast: Toast;
  refresh(): Promise<void>;
  latest: RefObject<RepoSnapshot | null>;
  /** An operation stopped on conflicts: open the conflict sheet. */
  onConflict(): void;
  setConfirm(c: Confirm | null): void;
}

/**
 * Every git write goes through `run`, one at a time: busy state, toasts, refresh.
 * Statuses that need a follow-up dialog (diverged / rejected / auth) are left to the caller.
 */
export function useRun({ path, toast, refresh, latest, onConflict, setConfirm }: Options) {
  const [busy, setBusy] = useState(false);
  /** A git operation is running here; another is refused until it ends (two git processes collide). */
  const running = useRef(false);
  /** True, after saying so, while another operation is still running. */
  const refuseBusy = () => {
    if (running.current) toast("err", t("app.busyRefused"));
    return running.current;
  };

  /** `quiet` leaves the success toast to the caller. */
  const run: Run = async (label, op, after, quiet = false) => {
    if (refuseBusy()) return { status: "failed", output: t("app.busyRefused") };
    let r: OpResult = { status: "failed", output: "" };
    running.current = true;
    setBusy(true);
    try {
      r = await op();
      if (r.status === "ok") {
        if (!quiet) toast("ok", label);
        after?.();
      } else if (r.status === "conflict") {
        // No toast: the sheet opens and the banner over it already says what happened.
        onConflict();
      } else if (r.status === "empty") askSkip();
      else if (r.status === "failed") toast("err", r.output || t("app.failed", { label }));
    } catch (e) {
      toast("err", String(e));
    } finally {
      running.current = false;
      setBusy(false);
      await refresh();
    }
    return r;
  };

  /** A pick stopped with nothing to commit: its change is already here. Offer to skip it. */
  const askSkip = () =>
    setConfirm({
      title: t("empty.title"),
      confirmLabel: t("empty.skip"),
      body: (
        <p>
          <Rich k="empty.body" vars={{ branch: latest.current?.head.branch ?? "HEAD" }} />
        </p>
      ),
      onConfirm: () => {
        setConfirm(null);
        void run(t("empty.skipped"), () => api.skip(path));
      },
    });

  return { busy, run, refuseBusy };
}
