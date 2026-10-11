// The branch colours and hidden branches of one repository (`branchLook.ts`),
// kept in localStorage for every tab of it.

import { useCallback, useState } from "react";
import { type BranchLook, EMPTY_LOOK, parseLooks, withColor, withHidden } from "../branchLook";
import { readStored, writeStored } from "../storage";

const KEY = "ddugit.branchLook";

export function useBranchLook(path: string) {
  const [look, setLook] = useState<BranchLook>(() => parseLooks(readStored(KEY))[path] ?? EMPTY_LOOK);
  const change = useCallback(
    (edit: (l: BranchLook) => BranchLook) =>
      setLook((cur) => {
        const next = edit(cur);
        // Read the rest again: another tab may have changed another repository's look.
        const all = parseLooks(readStored(KEY));
        if (next.hidden.length || Object.keys(next.colors).length) all[path] = next;
        else delete all[path];
        writeStored(KEY, JSON.stringify(all));
        return next;
      }),
    [path],
  );
  const setColor = useCallback(
    (base: string, color: string | null) => change((l) => withColor(l, base, color)),
    [change],
  );
  const setHidden = useCallback((keys: string[], hide: boolean) => change((l) => withHidden(l, keys, hide)), [change]);
  return { look, setColor, setHidden };
}
