// In-memory demo repository used when the UI runs outside Tauri
// (`npm run dev` in a plain browser). Implements the same command table as the
// Rust backend so the whole UX can be exercised without a repo on disk.
// The commands live by domain beside this file; the demo repository itself in `repo.ts`.

import { appCommands } from "./app";
import { historyCommands } from "./history";
import { localCommands } from "./local";
import { proCommands } from "./pro";
import { refsCommands } from "./refs";
import { remoteCommands } from "./remote";
import { repo, type Table } from "./repo";

export { demoControls, type DemoControls, type DemoFlags } from "./controls";

const mockTable: Table = {
  ...appCommands,
  ...localCommands,
  ...historyCommands,
  ...refsCommands,
  ...remoteCommands,
  ...proCommands,
};

/** Every command, then a reflog entry if it moved HEAD (named like git's). */
export const mock = Object.fromEntries(
  Object.entries(mockTable).map(([name, f]) => [
    name,
    async (args: never) => {
      const r = await (f as (a: never) => Promise<unknown>)(args);
      repo.noteHead(name.replace(/^git_/, "").replace(/_/g, " "));
      return r;
    },
  ]),
) as Table;
repo.noteHead("checkout: demo");
