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

/** `On main: try x` / `WIP on main: abc123 msg` → the user's part. */
export const stashTitle = (message: string) => message.replace(/^(WIP )?[Oo]n [^:]+:\s*/, "") || t("common.noMessage");
