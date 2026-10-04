// What the release publishes at the storage root, built from the storage's
// listing of one version's folder (`aws s3api list-objects-v2`):
//   downloads.json: the installers, for the download page
//   latest.json:    the update manifest the app's updater reads (tauri-plugin-updater),
//                   when the folder holds signed update files
// `node scripts/downloads.mjs <version> <public base url> <listing.json> <dir with the .sig files> <out dir>`

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const kind = (name) =>
  name.endsWith(".dmg")
    ? "macos"
    : name.endsWith("-setup.exe")
      ? "windows"
      : name.endsWith(".app.tar.gz")
        ? "macosUpdate"
        : null;

function files(base, objects) {
  const out = {};
  for (const { Key, Size } of objects) {
    const name = Key.split("/").pop();
    const k = kind(name);
    if (k) out[k] = { name, url: `${base}/${Key}`, size: Size };
  }
  return out;
}

export function downloads(version, base, objects, date = new Date().toISOString()) {
  const { macos, windows } = files(base, objects);
  if (!macos || !windows) throw new Error(`v${version} is missing an installer: ${Object.keys(files(base, objects))}`);
  return { version, date, files: { macos, windows } };
}

/**
 * The updater manifest, or null when this release has no signed update files.
 * `signature(name)` reads `<name>.sig`. The macOS update is universal, so both
 * architectures get the same file; Windows updates by running the installer.
 */
export function latest(version, base, objects, signature, date = new Date().toISOString()) {
  const f = files(base, objects);
  if (!f.macosUpdate || !f.windows) return null;
  const mac = { url: f.macosUpdate.url, signature: signature(f.macosUpdate.name) };
  const win = { url: f.windows.url, signature: signature(f.windows.name) };
  if (!mac.signature || !win.signature) return null;
  return {
    version,
    pub_date: date,
    platforms: { "darwin-aarch64": mac, "darwin-x86_64": mac, "windows-x86_64": win },
  };
}

if (process.argv[1]?.endsWith("downloads.mjs")) {
  const [version, base, listing, sigDir, outDir] = process.argv.slice(2);
  const { Contents = [] } = JSON.parse(readFileSync(listing, "utf8"));
  const date = new Date().toISOString();
  writeFileSync(join(outDir, "downloads.json"), JSON.stringify(downloads(version, base, Contents, date), null, 2));
  const sig = (name) => {
    const p = join(sigDir, `${name}.sig`);
    return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
  };
  const manifest = latest(version, base, Contents, sig, date);
  if (manifest) writeFileSync(join(outDir, "latest.json"), JSON.stringify(manifest, null, 2));
  console.log(manifest ? "downloads.json, latest.json" : "downloads.json (no signed update files)");
}
