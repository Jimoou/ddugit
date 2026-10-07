import { describe, expect, it } from "vitest";
import type { CommitInfo } from "../types";
import { squashMessage } from "./MergeDialog";

const c = (summary: string, parents = ["p"]): CommitInfo => ({
  id: summary,
  parents,
  summary,
  message: `${summary}\n\nbody of ${summary}\n`,
  author: "a",
  email: "a@x",
  time: 0,
});

describe("squashMessage", () => {
  it("keeps a single commit's whole message", () => {
    expect(squashMessage("feat", [c("Add zoom")])).toBe("Add zoom\n\nbody of Add zoom");
  });

  it("lists several commits oldest first under the branch name, merges left out", () => {
    const brought = [c("Third"), c("Merge main", ["a", "b"]), c("Second"), c("First")];
    expect(squashMessage("feat/zoom", brought)).toBe("feat/zoom\n\n* First\n* Second\n* Third");
  });
});
