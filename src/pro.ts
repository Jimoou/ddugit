// Free / Pro in the UI: one shared status (asked once, again after license
// changes) and the "this is Pro" offer any locked control can raise. The backend
// enforces the same lines (`pro.rs`); this only explains them.

import { useSyncExternalStore } from "react";
import { api } from "./api";
import type { ProStatus } from "./types";

/** What a locked control was for, so the offer can say it. */
export type ProFeature = "pulls" | "backport" | "dashboard" | "transfer" | "stack";

/** Repositories the dashboard shows on Free (starred first, then most recent). */
export const FREE_DASHBOARD = 3;

let status: ProStatus | null = null;
let offer: ProFeature | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Ask the backend again (startup, and after a license is applied, removed or renewed). */
export function refreshPro() {
  void api.proStatus().then(
    (s) => {
      status = s;
      emit();
    },
    () => {},
  );
}

/** The current status; null until the first answer (nothing is shown locked meanwhile). */
export const usePro = () => useSyncExternalStore(subscribe, () => status);
/** Pro is open, or not known yet. */
export const proOpen = (s: ProStatus | null) => s?.pro ?? true;

export function offerPro(feature: ProFeature) {
  offer = feature;
  emit();
}
export function closeProOffer() {
  offer = null;
  emit();
}
export const useProOffer = () => useSyncExternalStore(subscribe, () => offer);
