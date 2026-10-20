// The Microsoft Store package's contents: the Windows app (one ddugit.exe; the
// web assets are inside it), its tiles and the manifest. `scripts/msix-pack.sh`
// indexes the tiles into resources.pri and packs the folder into the .msix. The package is left unsigned: the
// Store signs what it accepts. Identity comes from Partner Center (Product
// identity), so the Store recognises the package as ddugit's.
// `node scripts/msix.mjs <ddugit.exe> <out dir> <identity name> <publisher> <publisher display name>`

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tiles and icons (`src-tauri/icons/msix`, from the brand kit), in every scale and target size. The
 * manifest names each once; Windows picks a variant through resources.pri. Square44x44Logo is the
 * taskbar, Start list and title bar icon: its `targetsize-N_altform-unplated` (dark taskbar) and
 * `_altform-lightunplated` (light) variants are drawn full size as they are. Without them Windows
 * shrinks the scale variant onto a plate of the accent colour.
 */
export const ASSETS = "src-tauri/icons/msix";
export const LOGOS = ["StoreLogo", "Square44x44Logo", "Square150x150Logo", "Wide310x150Logo"];
/** The icon sizes Windows asks for most (taskbar, Start, Alt+Tab, Explorer). */
export const UNPLATED_SIZES = [16, 24, 32, 48, 256];

const xml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/** The Store wants four numbers and the last one 0. */
export function msixVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`not a release version: ${version}`);
  return `${m[1]}.${m[2]}.${m[3]}.0`;
}

/**
 * The manifest of a full-trust desktop app (it runs git, ssh and the user's
 * tools like any program, so `runFullTrust`; the Store asks why when submitting).
 */
export function manifest({ name, publisher, publisherName, version, description }) {
  if (!name || !publisher || !publisherName) throw new Error("identity name, publisher and publisher name are needed");
  if (!publisher.startsWith("CN=")) throw new Error(`publisher must be Partner Center's "CN=…" value: ${publisher}`);
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${xml(name)}" Publisher="${xml(publisher)}" Version="${msixVersion(version)}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>ddugit</DisplayName>
    <PublisherDisplayName>${xml(publisherName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
    <Resource Language="ko-kr" />
  </Resources>
  <Applications>
    <Application Id="ddugit" Executable="ddugit.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="ddugit"
        Description="${xml(description)}"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [exe, out, name, publisher, publisherName] = process.argv.slice(2);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  mkdirSync(join(out, "Assets"), { recursive: true });
  copyFileSync(exe, join(out, "ddugit.exe"));
  for (const file of readdirSync(join(root, ASSETS)).filter((f) => f.endsWith(".png")))
    copyFileSync(join(root, ASSETS, file), join(out, "Assets", file));
  const text = manifest({
    name,
    publisher,
    publisherName,
    version: conf.version,
    description: conf.bundle.shortDescription,
  });
  writeFileSync(join(out, "AppxManifest.xml"), text);
  console.log(`${out}: ddugit ${msixVersion(conf.version)} as ${name} (${publisher})`);
}
