// Build `downloads.json` (what the download page reads) from the storage's
// listing of one version's folder: `node scripts/downloads.mjs <version> <public base url> <list-objects-v2.json>`.

import { readFileSync } from "node:fs";

export function downloads(version, base, objects, date = new Date().toISOString()) {
  const files = {};
  for (const { Key, Size } of objects) {
    const name = Key.split("/").pop();
    const os = name.endsWith(".dmg") ? "macos" : name.endsWith("-setup.exe") ? "windows" : null;
    if (os) files[os] = { name, url: `${base}/${Key}`, size: Size };
  }
  if (!files.macos || !files.windows) throw new Error(`v${version} is missing an installer: ${Object.keys(files)}`);
  return { version, date, files };
}

if (process.argv[1]?.endsWith("downloads.mjs")) {
  const [version, base, listing] = process.argv.slice(2);
  const { Contents = [] } = JSON.parse(readFileSync(listing, "utf8"));
  console.log(JSON.stringify(downloads(version, base, Contents), null, 2));
}
