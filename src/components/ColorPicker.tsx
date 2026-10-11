// A colour palette for a branch: saturation and brightness on a square, hue on
// a bar, or a hex code. The choice is applied when a drag ends (the map lays
// itself out again for it), not on every move. "Auto" gives the branch back its
// automatic colour.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Hsv, hexToHsv, hsvToHex, isHex } from "../color";
import { t } from "../i18n";
import { useDialog } from "./useDialog";

interface Props {
  x: number;
  y: number;
  /** The branch it is for. */
  title: string;
  /** The colour it has now. */
  value: string;
  /** A colour of its own (not the automatic one): "Auto" is offered. */
  chosen: boolean;
  onPick(hex: string | null): void;
  onClose(): void;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function ColorPicker(p: Props) {
  const { onClose, onPick } = p;
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(p.value));
  const [typed, setTyped] = useState(p.value);
  const hex = hsvToHex(hsv);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: p.x, y: p.y });
  const { ref: layer } = useDialog(onClose, false);
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      layer(el);
    },
    [layer],
  );

  // Inside the window, like a menu.
  useLayoutEffect(() => {
    const r = box.current!.getBoundingClientRect();
    setPos({ x: Math.min(p.x, window.innerWidth - r.width - 8), y: Math.min(p.y, window.innerHeight - r.height - 8) });
  }, [p.x, p.y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const set = (next: Hsv, apply: boolean) => {
    setHsv(next);
    setTyped(hsvToHex(next));
    if (apply) onPick(hsvToHex(next));
  };

  /** Pointer drag on an area: `read` turns the pointer's place (0–1 across, 0–1 down) into a colour. */
  const drag = (read: (fx: number, fy: number) => Hsv) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return read(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
    };
    let last = at(e);
    setHsv(last);
    setTyped(hsvToHex(last));
    const move = (ev: PointerEvent) => {
      last = at(ev);
      setHsv(last);
      setTyped(hsvToHex(last));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      onPick(hsvToHex(last));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  /** Arrow keys on the square (saturation ←→, brightness ↑↓) and the hue bar. */
  const keys = (step: (dx: number, dy: number) => Hsv) => (e: React.KeyboardEvent) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    set(step(d[0], d[1]), true);
  };

  return (
    <div
      className="color-picker"
      ref={attach}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={`${t("branch.color")}: ${p.title}`}
    >
      <div className="color-picker-title">{p.title}</div>
      <div
        className="cp-square"
        role="slider"
        tabIndex={0}
        aria-label={t("color.shade")}
        aria-valuetext={hex}
        style={{ ["--hue" as string]: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={drag((fx, fy) => ({ h: hsv.h, s: fx, v: 1 - fy }))}
        onKeyDown={keys((dx, dy) => ({ h: hsv.h, s: clamp(hsv.s + dx * 0.05), v: clamp(hsv.v + dy * 0.05) }))}
      >
        <span className="cp-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div
        className="cp-hue"
        role="slider"
        tabIndex={0}
        aria-label={t("color.hue")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={drag((fx) => ({ ...hsv, h: fx * 359.9 }))}
        onKeyDown={keys((dx, dy) => ({ ...hsv, h: (hsv.h + (dx || -dy) * 5 + 360) % 360 }))}
      >
        <span className="cp-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <div className="cp-row">
        <span className="cp-preview" style={{ background: hex }} aria-hidden />
        <input
          className="text cp-hex"
          aria-label={t("color.hex")}
          value={typed}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            setTyped(v);
            const full = v.startsWith("#") ? v : `#${v}`;
            if (isHex(full)) setHsv(hexToHsv(full.toLowerCase()));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isHex(hex)) onPick(hex);
          }}
          onBlur={() => {
            // Only a code the user typed: the square's colour was applied when its drag ended.
            const full = (typed.startsWith("#") ? typed : `#${typed}`).toLowerCase();
            if (isHex(full) && full !== p.value.toLowerCase()) onPick(full);
          }}
        />
        {p.chosen && (
          <button className="ghost cp-auto" onClick={() => (onPick(null), onClose())}>
            {t("color.auto")}
          </button>
        )}
      </div>
    </div>
  );
}
