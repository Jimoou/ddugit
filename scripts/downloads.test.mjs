import { describe, expect, it } from "vitest";
import { downloads, latest } from "./downloads.mjs";

const base = "https://x.supabase.co/storage/v1/object/public/releases";
const objects = [
  { Key: "v1.2.0/ddugit_1.2.0_universal.dmg", Size: 20 },
  { Key: "v1.2.0/ddugit_1.2.0_x64-setup.exe", Size: 9 },
  { Key: "v1.2.0/ddugit_1.2.0_x64-setup.exe.sig", Size: 1 },
  { Key: "v1.2.0/ddugit.app.tar.gz", Size: 18 },
  { Key: "v1.2.0/ddugit.app.tar.gz.sig", Size: 1 },
];
const sigs = { "ddugit.app.tar.gz": "MAC", "ddugit_1.2.0_x64-setup.exe": "WIN" };

describe("downloads", () => {
  it("lists the two installers", () => {
    const d = downloads("1.2.0", base, objects, "D");
    expect(d.files.macos).toEqual({
      name: "ddugit_1.2.0_universal.dmg",
      url: `${base}/v1.2.0/ddugit_1.2.0_universal.dmg`,
      size: 20,
    });
    expect(d.files.windows.name).toBe("ddugit_1.2.0_x64-setup.exe");
  });
  it("refuses a release missing an installer", () => {
    expect(() => downloads("1.2.0", base, objects.slice(1))).toThrow(/missing/);
  });
});

describe("latest", () => {
  it("points every platform at its signed update file", () => {
    const m = latest("1.2.0", base, objects, (n) => sigs[n] ?? null, "D");
    expect(m.version).toBe("1.2.0");
    expect(m.platforms["darwin-aarch64"]).toEqual({ url: `${base}/v1.2.0/ddugit.app.tar.gz`, signature: "MAC" });
    expect(m.platforms["darwin-x86_64"]).toEqual(m.platforms["darwin-aarch64"]);
    expect(m.platforms["windows-x86_64"]).toEqual({
      url: `${base}/v1.2.0/ddugit_1.2.0_x64-setup.exe`,
      signature: "WIN",
    });
  });
  it("is absent without the update files or their signatures", () => {
    expect(latest("1.2.0", base, objects.slice(0, 3), (n) => sigs[n] ?? null)).toBeNull();
    expect(latest("1.2.0", base, objects, () => null)).toBeNull();
  });
});
