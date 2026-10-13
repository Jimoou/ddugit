import { describe, expect, it } from "vitest";
import { manifest, msixVersion } from "./msix.mjs";

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

  it("refuses a missing identity or a publisher that isn't Partner Center's", () => {
    expect(() => manifest({ ...identity, name: "", version: "1.4.3" })).toThrow();
    expect(() => manifest({ ...identity, publisher: "Me", version: "1.4.3" })).toThrow(/CN=/);
  });
});
