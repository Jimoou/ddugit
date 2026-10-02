// Display formatting for git data, shared by panels and the graph.

import { localeTag, t } from "./i18n";

export const fmtTime = (t: number, withYear = true) =>
  new Date(t * 1000).toLocaleString(localeTag(), {
    ...(withYear ? { year: "numeric" } : {}),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** How long ago `t` (unix seconds) was, in words ("3 days ago"), from `now` (ms). */
export function fmtAgo(t: number, now = Date.now()): string {
  const s = Math.round(t - now / 1000);
  const rtf = new Intl.RelativeTimeFormat(localeTag(), { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, sec] of steps) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
  return rtf.format(0, "second");
}

/** `On main: try x` / `WIP on main: abc123 msg` → the user's part. */
export const stashTitle = (message: string) => message.replace(/^(WIP )?[Oo]n [^:]+:\s*/, "") || t("common.noMessage");
