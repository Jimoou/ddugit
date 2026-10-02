// Every repository is a planet: its look (hue, ring, bands) comes from its
// path, so the same repository is always the same planet: in the tabs, the
// recent list and the moment it is born (opened, cloned or created).

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

/** A lit sphere at (x, y) of radius `r`, light from the upper left; `alpha` fades it into the sky. */
export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  look: PlanetLook,
  alpha = 1,
) {
  const { hue } = look;
  ctx.save();
  ctx.globalAlpha = alpha;
  const ring = (front: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    ctx.scale(1, 0.28);
    ctx.beginPath();
    // The back half goes behind the sphere, the front half over it.
    ctx.arc(0, 0, r * 1.75, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.lineWidth = r * 0.22;
    ctx.strokeStyle = `hsla(${hue + 30}, 55%, 72%, 0.55)`;
    ctx.stroke();
    ctx.restore();
  };
  if (look.ring) ring(false);
  // Atmosphere glow.
  const glow = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.6);
  glow.addColorStop(0, `hsla(${hue}, 90%, 65%, 0.35)`);
  glow.addColorStop(1, `hsla(${hue}, 90%, 65%, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  // The lit face.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const face = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
  face.addColorStop(0, `hsl(${hue}, 85%, 78%)`);
  face.addColorStop(0.55, `hsl(${hue}, 60%, 42%)`);
  face.addColorStop(1, `hsl(${hue + 20}, 50%, 12%)`);
  ctx.fillStyle = face;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  for (let i = 0; i < look.bands; i++) {
    const by = y - r * 0.5 + (i * r) / Math.max(1, look.bands - 0.5);
    ctx.fillStyle = `hsla(${hue + 25 * (i % 2 ? 1 : -1)}, 70%, 60%, 0.18)`;
    ctx.fillRect(x - r, by, r * 2, r * 0.16);
  }
  // Night side.
  const shade = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  shade.addColorStop(0.45, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = shade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  if (look.ring) ring(true);
  ctx.restore();
}
