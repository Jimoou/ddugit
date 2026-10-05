import { afterEach, describe, expect, it, vi } from "vitest";

const openUrl = vi.fn<(path: string, url: string) => Promise<null>>();
vi.mock("./api", () => ({ api: { openUrl: (path: string, url: string) => openUrl(path, url) } }));

const { copyText, onShareFailure, openLink } = await import("./share");

/** Let the promise callbacks inside `copyText` / `openLink` run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("share", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    openUrl.mockReset();
  });

  it("copies and reports done, or shows a failure when the clipboard refuses or is missing", async () => {
    const shown: string[] = [];
    onShareFailure((text) => shown.push(text));
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValueOnce();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const done = vi.fn();
    copyText("abc123", done);
    await settle();
    expect(writeText).toHaveBeenCalledWith("abc123");
    expect(done).toHaveBeenCalledOnce();
    expect(shown).toEqual([]);

    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    copyText("abc123", done);
    await settle();
    expect(done).toHaveBeenCalledOnce();
    expect(shown).toEqual(["클립보드에 복사하지 못했어요"]);

    vi.stubGlobal("navigator", {});
    copyText("abc123", done);
    expect(shown).toHaveLength(2);
    expect(done).toHaveBeenCalledOnce();
  });

  it("opens links through the backend and shows why one could not be opened", async () => {
    const shown: string[] = [];
    onShareFailure((text) => shown.push(text));
    openUrl.mockResolvedValueOnce(null);
    openLink("https://ddugit.com", "/work/rocket");
    await settle();
    expect(openUrl).toHaveBeenCalledWith("/work/rocket", "https://ddugit.com");
    expect(shown).toEqual([]);

    openUrl.mockRejectedValueOnce("Only https links can be opened");
    openLink("file:///etc/passwd");
    await settle();
    expect(openUrl).toHaveBeenLastCalledWith("", "file:///etc/passwd");
    expect(shown).toEqual(["링크를 열지 못했어요: Only https links can be opened"]);
  });
});
