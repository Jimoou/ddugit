// First-run tutorial: a short voyage through what ddugit does differently,
// played on the demo repository. Pure state; `components/Missions.tsx` shows it.

export const MISSIONS = ["inspect", "commit", "merge", "undo", "bisect", "push"] as const;
export type MissionId = (typeof MISSIONS)[number];

export interface Voyage {
  done: MissionId[];
  /** Closed by the user; reopened from the demo badge. */
  dismissed: boolean;
}

export const NEW_VOYAGE: Voyage = { done: [], dismissed: false };

/** Stored progress, tolerating anything malformed or from an older list. */
export function parseVoyage(raw: string | null): Voyage {
  try {
    const v = JSON.parse(raw ?? "") as Partial<Voyage>;
    const done = Array.isArray(v.done) ? MISSIONS.filter((m) => v.done!.includes(m)) : [];
    return { done, dismissed: v.dismissed === true };
  } catch {
    return NEW_VOYAGE;
  }
}

/** The voyage with `id` done (unchanged when it already was). */
export function complete(v: Voyage, id: MissionId): Voyage {
  return v.done.includes(id) ? v : { ...v, done: MISSIONS.filter((m) => m === id || v.done.includes(m)) };
}

/** The first mission not done yet, or null when the voyage is over. */
export function current(v: Voyage): MissionId | null {
  return MISSIONS.find((m) => !v.done.includes(m)) ?? null;
}
