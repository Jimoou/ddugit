import { Fragment } from "react";
import { type Key, t } from ".";

const TAG = /<(b|code)>(.*?)<\/\1>/g;

/** A translated string whose <b>/<code> markup becomes elements (no raw HTML). */
export function Rich({ k, vars }: { k: Key; vars?: Record<string, string | number> }) {
  const text = t(k, vars);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    parts.push(text.slice(last, m.index));
    parts.push(m[1] === "b" ? <b key={m.index}>{m[2]}</b> : <code key={m.index}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
