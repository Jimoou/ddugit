import { useState } from "react";
import { t } from "../i18n";
import { copyText } from "../share";

/** git's own message, folded away, selectable and with a copy button. */
export function GitOutput({ text, open = false }: { text: string; open?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="git-output" open={open}>
      <summary className="muted">{t("auth.output")}</summary>
      <pre className="raw">{text.trim()}</pre>
      <button className="small" onClick={() => copyText(text.trim(), () => setCopied(true))}>
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </details>
  );
}
