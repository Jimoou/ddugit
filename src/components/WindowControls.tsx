import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { Icon } from "./Icon";

/** Minimize / maximize (restore) / close for the frameless Windows window. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const w = getCurrentWindow();
    const read = () => void w.isMaximized().then(setMaximized);
    read();
    const off = w.onResized(read);
    return () => void off.then((f) => f());
  }, []);
  const w = () => getCurrentWindow();
  return (
    <div className="win-controls">
      <button aria-label={t("win.minimize")} title={t("win.minimize")} onClick={() => void w().minimize()}>
        <Icon name="minus" />
      </button>
      <button
        aria-label={maximized ? t("win.restore") : t("win.maximize")}
        title={maximized ? t("win.restore") : t("win.maximize")}
        onClick={() => void w().toggleMaximize()}
      >
        <Icon name={maximized ? "restore" : "square"} size={12} />
      </button>
      <button className="close" aria-label={t("win.close")} title={t("win.close")} onClick={() => void w().close()}>
        <Icon name="close" />
      </button>
    </div>
  );
}
