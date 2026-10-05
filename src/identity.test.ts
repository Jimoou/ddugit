import { describe, expect, it } from "vitest";
import {
  matchesProfile,
  parseProfiles,
  profileError,
  profileFrom,
  sameIdentity,
  signingHint,
  upsertProfile,
  viewIdentity,
} from "./identity";
import { defaults, parseSettings } from "./settings";
import type { Identity, Profile } from "./types";

const work: Profile = { name: "Kim Work", email: "kim@corp.example", signing: null };
const signed: Profile = { ...work, signing: { format: "ssh", key: "/home/kim/.ssh/id_ed25519.pub" } };

function identity(over: Partial<Identity> = {}): Identity {
  return {
    name: { value: "Kim Home", scope: "global" },
    email: { value: "kim@home.example", scope: "global" },
    sign: null,
    format: null,
    key: null,
    ...over,
  };
}

describe("parseProfiles", () => {
  it("keeps well-formed profiles and drops broken entries", () => {
    expect(parseProfiles("x")).toBeNull();
    expect(
      parseProfiles([
        work,
        { name: 1, email: "a@b" },
        null,
        { ...signed },
        { name: "A", email: "a@b.c", signing: { format: "x509", key: "k" } },
        { name: "B", email: "b@b.c", signing: { format: "openpgp", key: " " } },
      ]),
    ).toEqual([
      work,
      signed,
      { name: "A", email: "a@b.c", signing: null },
      { name: "B", email: "b@b.c", signing: null },
    ]);
  });
  it("is read as part of the settings", () => {
    const s = parseSettings(JSON.stringify({ profiles: [signed, 3] }), defaults());
    expect(s.profiles).toEqual([signed]);
    expect(parseSettings(JSON.stringify({ profiles: "no" }), defaults()).profiles).toEqual([]);
  });
});

describe("profileError", () => {
  it("names what is wrong", () => {
    expect(profileError(work)).toBeNull();
    expect(profileError(signed)).toBeNull();
    expect(profileError({ ...work, name: "  " })).toBe("identity.err.name");
    expect(profileError({ ...work, name: "a\nb" })).toBe("identity.err.name");
    expect(profileError({ ...work, email: "kim" })).toBe("identity.err.email");
    expect(profileError({ ...work, email: "<kim@corp.example>" })).toBe("identity.err.email");
    expect(profileError({ ...work, signing: { format: "openpgp", key: "" } })).toBe("identity.err.key");
  });
});

describe("viewIdentity", () => {
  it("shows name <email>, where it comes from and whether commits are signed", () => {
    expect(viewIdentity(identity())).toEqual({
      text: "Kim Home <kim@home.example>",
      missing: false,
      local: false,
      signs: null,
    });
    const local = identity({
      name: { value: "Kim Work", scope: "local" },
      sign: { value: true, scope: "global" },
      format: { value: "ssh", scope: "local" },
      key: { value: "/k.pub", scope: "local" },
    });
    expect(viewIdentity(local)).toMatchObject({ local: true, signs: "ssh" });
    // Signing on without a key signs nothing (git would fail); default format is openpgp.
    expect(viewIdentity(identity({ sign: { value: true, scope: "global" } })).signs).toBeNull();
    expect(
      viewIdentity(identity({ sign: { value: true, scope: "global" }, key: { value: "ABCD", scope: "global" } })).signs,
    ).toBe("openpgp");
  });
  it("flags a missing name or email", () => {
    expect(viewIdentity(identity({ email: null }))).toMatchObject({ text: "Kim Home", missing: true });
    expect(viewIdentity(identity({ name: null }))).toMatchObject({ text: "<kim@home.example>", missing: true });
    expect(viewIdentity(identity({ name: null, email: null }))).toMatchObject({ text: "", missing: true });
  });
});

describe("matching and making profiles", () => {
  it("matches by name and email, and by signing for the full match", () => {
    const id = identity({
      name: { value: "Kim Work", scope: "local" },
      email: { value: "KIM@corp.example", scope: "local" },
    });
    expect(sameIdentity(id, work)).toBe(true);
    expect(matchesProfile(id, work)).toBe(true);
    expect(matchesProfile(id, signed)).toBe(false);
    const signing = {
      ...id,
      sign: { value: true, scope: "local" },
      format: { value: "ssh", scope: "local" },
      key: { value: "/home/kim/.ssh/id_ed25519.pub", scope: "local" },
    };
    expect(matchesProfile(signing, signed)).toBe(true);
    expect(matchesProfile(signing, work)).toBe(false);
    expect(sameIdentity(null, work)).toBe(false);
  });
  it("makes a profile from the current identity", () => {
    expect(profileFrom(identity())).toEqual({ name: "Kim Home", email: "kim@home.example", signing: null });
    expect(
      profileFrom(identity({ sign: { value: true, scope: "global" }, key: { value: "ABCD", scope: "global" } })),
    ).toMatchObject({ signing: { format: "openpgp", key: "ABCD" } });
    expect(profileFrom(identity({ email: null }))).toBeNull();
  });
  it("adds, replaces in place and folds duplicates", () => {
    const home = { name: "Kim Home", email: "kim@home.example", signing: null };
    expect(upsertProfile([], { ...work, name: " Kim Work " }, null)).toEqual([work]);
    expect(upsertProfile([work, home], signed, null)).toEqual([home, signed]);
    expect(upsertProfile([work, home], { ...home, name: "Kim" }, 1)).toEqual([work, { ...home, name: "Kim" }]);
    expect(upsertProfile([work, home], { ...home, name: "Kim" }, 0)).toEqual([{ ...home, name: "Kim" }, home]);
  });
});

describe("signingHint", () => {
  it("recognizes gpg and ssh signing failures", () => {
    expect(signingHint("error: gpg failed to sign the data\nfatal: failed to write commit object")).toBe(
      "identity.hint.gpg",
    );
    expect(signingHint("gpg: signing failed: Inappropriate ioctl for device")).toBe("identity.hint.gpg");
    expect(
      signingHint("error: Couldn't load public key /x.pub: No such file\nfatal: failed to write commit object"),
    ).toBe("identity.hint.ssh");
    expect(signingHint("nothing to commit, working tree clean")).toBeNull();
  });
});
