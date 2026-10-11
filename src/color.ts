// Colour math for the branch colour palette: hex ↔ HSV, WCAG contrast, and
// the ink a chosen colour is drawn in on each theme's map. Pure.

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5), f(3), f(1)].map((c) => c * 255));
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = channels(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

/** WCAG relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `hex` mixed toward black (`t` < 0) or white (`t` > 0) by |t|. */
function shade(hex: string, t: number): string {
  const to = t < 0 ? 0 : 255;
  return toHex(channels(hex).map((c) => c + (to - c) * Math.abs(t)));
}

/**
 * The ink a chosen colour is drawn in: as chosen when it reads on the map,
 * else the nearest shade that does — darker until it reads as text on paper
 * (4.5:1 against `paper` and white badges), lighter until it shows on the
 * night sky (3:1 against `sky`).
 */
export function inkFor(hex: string, ground: { paper: boolean; sky: string }): string {
  const reads = (c: string) =>
    ground.paper ? contrast(c, ground.sky) >= 4.5 && contrast(c, "#ffffff") >= 4.5 : contrast(c, ground.sky) >= 3;
  for (let t = 0; t <= 1; t += 0.05) {
    const c = shade(hex, ground.paper ? -t : t);
    if (reads(c)) return c;
  }
  return ground.paper ? "#000000" : "#ffffff";
}
