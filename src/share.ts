// Handing text and links to the rest of the computer: the clipboard and the
// system browser. Either can fail (no clipboard permission, no https link,
// no opener), and the user should hear about it rather than find nothing pasted.

import { api } from "./api";
import { t } from "./i18n";

let failed: (text: string) => void = () => {};

/** Where copy and open failures are shown (the window's error toasts). */
export function onShareFailure(show: (text: string) => void) {
  failed = show;
}

/** Copy `text`; `onDone` runs once it is on the clipboard, a failure is shown. */
export function copyText(text: string, onDone?: () => void) {
  const clip = navigator.clipboard as Clipboard | undefined;
  if (!clip) return failed(t("share.copyFailed"));
  clip.writeText(text).then(onDone, () => failed(t("share.copyFailed")));
}

/** Open `url` in the system browser (https only, the backend checks); a failure is shown. `path`: the tab's repository, for the demo. */
export function openLink(url: string, path = "") {
  api.openUrl(path, url).catch((e) => failed(t("share.openFailed", { error: String(e) })));
}
