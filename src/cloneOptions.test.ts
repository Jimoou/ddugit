import { describe, expect, it } from "vitest";
import { CLONE_DRAFT, cloneOptions } from "./cloneOptions";

describe("clone options", () => {
  it("leaves everything to git by default", () => {
    expect(cloneOptions(CLONE_DRAFT)).toEqual({
      options: { branch: null, depth: null, singleBranch: false, submodules: false },
    });
  });

  it("takes a branch, a depth when shallow, and the switches", () => {
    const d = { branch: " release/1.2 ", shallow: true, depth: " 20 ", singleBranch: true, submodules: true };
    expect(cloneOptions(d)).toEqual({
      options: { branch: "release/1.2", depth: 20, singleBranch: true, submodules: true },
    });
    // The depth only counts when shallow.
    expect(cloneOptions({ ...CLONE_DRAFT, depth: "x" })).toHaveProperty("options.depth", null);
  });

  it("refuses branch names git can't have and depths that aren't counts", () => {
    for (const branch of ["--upload-pack=x", "a b", "a..b", "a~1", "x.lock", "a:b", "/x", "x/"])
      expect(cloneOptions({ ...CLONE_DRAFT, branch }), branch).toEqual({ error: "clone.adv.badBranch" });
    for (const depth of ["0", "-3", "1.5", "", "many", "99999999"])
      expect(cloneOptions({ ...CLONE_DRAFT, shallow: true, depth }), depth).toEqual({ error: "clone.adv.badDepth" });
  });
});
