import { useState } from "react";
import { t } from "../i18n";

/**
 * Commits by short id and summary: the first `listed`, then "and N more", which shows the rest
 * (a long push or pull request is checked commit by commit).
 */
export function CommitList({
  commits,
  listed = 8,
  className,
}: {
  commits: { id: string; summary: string }[];
  listed?: number;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? commits : commits.slice(0, listed);
  return (
    <ul className={className}>
      {shown.map((c) => (
        <li key={c.id}>
          <code>{c.id.slice(0, 7)}</code> {c.summary}
        </li>
      ))}
      {!all && commits.length > listed && (
        <li>
          <button className="link muted" onClick={() => setAll(true)}>
            {t("sync.ask.more", { n: commits.length - listed })}
          </button>
        </li>
      )}
    </ul>
  );
}
