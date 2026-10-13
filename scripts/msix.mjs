// The Microsoft Store package's contents: the Windows app (one ddugit.exe; the
// web assets are inside it), its tiles and the manifest. `makeappx pack` turns
// the folder into the .msix (release.yml). The package is left unsigned: the
// Store signs what it accepts. Identity comes from Partner Center (Product
// identity), so the Store recognises the package as ddugit's.
// `node scripts/msix.mjs <ddugit.exe> <out dir> <identity name> <publisher> <publisher display name>`

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Tiles the Store and Start need, from the icons `tauri icon` made. */
export const TILES = ["StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png", "Square310x310Logo.png"];

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
        <uap:DefaultTile Square310x310Logo="Assets\\Square310x310Logo.png" />
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
  for (const tile of TILES) copyFileSync(join(root, "src-tauri/icons", tile), join(out, "Assets", tile));
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
