import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSETS, LOGOS, manifest, msixVersion, UNPLATED_SIZES } from "./msix.mjs";

const identity = { name: "12345Me.ddugit", publisher: "CN=ABCD-1234", publisherName: "Me", description: "Git & more" };

describe("msix", () => {
  it("numbers a release the way the Store wants: four parts, the last 0", () => {
    expect(msixVersion("1.4.3")).toBe("1.4.3.0");
    expect(() => msixVersion("1.4.3-beta")).toThrow();
  });

  it("writes the Partner Center identity into a full-trust desktop manifest", () => {
    const m = manifest({ ...identity, version: "1.4.3" });
    expect(m).toContain('<Identity Name="12345Me.ddugit" Publisher="CN=ABCD-1234" Version="1.4.3.0"');
    expect(m).toContain("<PublisherDisplayName>Me</PublisherDisplayName>");
    expect(m).toContain('EntryPoint="Windows.FullTrustApplication"');
    expect(m).toContain('<rescap:Capability Name="runFullTrust" />');
    // Text is escaped for XML.
    expect(m).toContain('Description="Git &amp; more"');
  });

  it("names each logo once (Windows picks the variant) and gives Start a wide tile", () => {
    const m = manifest({ ...identity, version: "1.4.3" });
    for (const logo of ["StoreLogo", "Square44x44Logo", "Square150x150Logo", "Wide310x150Logo"])
      expect(m).toContain(`Assets\\${logo}.png`);
    expect(m).toContain('<uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png" />');
  });

  it("ships every logo at every scale, and the taskbar icon unplated in dark and light", () => {
    const files = new Set(readdirSync(new URL(`../${ASSETS}`, import.meta.url)));
    for (const logo of LOGOS)
      for (const scale of [100, 125, 150, 200, 400]) expect(files).toContain(`${logo}.scale-${scale}.png`);
    for (const size of UNPLATED_SIZES)
      for (const form of ["unplated", "lightunplated"])
        expect(files).toContain(`Square44x44Logo.targetsize-${size}_altform-${form}.png`);
  });

  it("refuses a missing identity or a publisher that isn't Partner Center's", () => {
    expect(() => manifest({ ...identity, name: "", version: "1.4.3" })).toThrow();
    expect(() => manifest({ ...identity, publisher: "Me", version: "1.4.3" })).toThrow(/CN=/);
  });
});
