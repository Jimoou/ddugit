// How big the map's text draws. Labels keep their screen size as the map zooms out (the semantic
// zoom thins them out instead); zoomed in past 100% they grow with it, slower than the map, so a
// closer look also reads larger without two-line captions covering the screen. The reader's own
// size (Settings) scales every zoom level.

/** Settings → map text size. */
export const MAP_TEXT_SIZES = ["small", "normal", "large"] as const;
export type MapTextSize = (typeof MAP_TEXT_SIZES)[number];

const SIZE: Record<MapTextSize, number> = { small: 0.88, normal: 1, large: 1.2 };

/** Zoom adds at most this much (reached near 260%). */
export const ZOOM_TEXT_MAX = 1.6;

/**
 * The factor on the map's base type at zoom `k`: the size setting times √k past 100%. Rounded to
 * sixteenths, so a zoom gesture measures each label at a handful of sizes instead of one per frame.
 */
export function textScale(k: number, size: MapTextSize): number {
  const zoom = Math.min(Math.sqrt(Math.max(k, 1)), ZOOM_TEXT_MAX);
  return Math.round(zoom * SIZE[size] * 16) / 16;
}
