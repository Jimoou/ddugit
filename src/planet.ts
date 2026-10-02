// Every repository is a planet: its look (hue, ring, bands) comes from its
// path, so the same repository is always the same planet: in the tabs, the
// recent list and the galaxy dashboard.

export interface PlanetLook {
  /** Base hue, degrees. */
  hue: number;
  /** Has a ring, like a gas giant. */
  ring: boolean;
  /** Cloud bands across the face (0 = a plain rocky world). */
  bands: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function planetLook(path: string): PlanetLook {
  const h = hash(path);
  return { hue: h % 360, ring: (h >>> 9) % 3 === 0, bands: (h >>> 12) % 4 };
}
