import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IconName } from "../icons";
import { Icon } from "./Icon";
import { useDialog } from "./useDialog";

/** A menu entry; one with an `icon` also shows in toolbars built from the same menu (the commit panel's). */
export type MenuItem =
  | { label: string; hint?: string; icon?: IconName; danger?: boolean; disabled?: boolean; onSelect(): void }
  | "separator";

interface Props {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
  onClose(): void;
}

/** Floating menu at the cursor; closes on outside click, Esc, scroll or after a choice. */
export function ContextMenu({ x, y, title, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  // Esc goes through the layer stack so it closes the menu, not the sheet under it as well.
  const { ref: layer } = useDialog(onClose, false);
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      layer(el);
    },
    [layer],
  );

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  return (
    <div className="context-menu" ref={attach} style={{ left: pos.x, top: pos.y }} role="menu">
      {title && <div className="menu-title">{title}</div>}
      {items.map((it, i) =>
        it === "separator" ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={it.danger ? "danger-text" : ""}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            <span className="menu-label">
              {it.icon && <Icon name={it.icon} size={13} />}
              {it.label}
            </span>
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
