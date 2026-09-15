// @vitest-environment jsdom

import {
  handleStaleChunkScriptError,
  isStaleNextScriptElement,
  STALE_CHUNK_RELOAD_SESSION_KEY,
} from "@/src/features/version-update/reloadOnStaleChunk";

function scriptErrorEvent(src: string): Event {
  const script = document.createElement("script");
  script.src = src;
  const event = new Event("error");
  Object.defineProperty(event, "target", { value: script });
  return event;
}

describe("isStaleNextScriptElement", () => {
  it("matches a Next.js static chunk script", () => {
    const script = document.createElement("script");
    script.src =
      "https://us.cloud.langfuse.com/_next/static/chunks/31w9e6884-o68.js";
    expect(isStaleNextScriptElement(script)).toBe(true);
  });

  it("rejects a third-party script", () => {
    const script = document.createElement("script");
    script.src = "https://cdn.example.com/vendor.js";
    expect(isStaleNextScriptElement(script)).toBe(false);
  });

  it("rejects a stylesheet or missing target", () => {
    const link = document.createElement("link");
    link.href = "https://us.cloud.langfuse.com/_next/static/chunks/app.css";
    expect(isStaleNextScriptElement(link)).toBe(false);
    expect(isStaleNextScriptElement(null)).toBe(false);
  });
});

describe("handleStaleChunkScriptError", () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockReset();
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("reloads once when a Next chunk script fails to load", () => {
    handleStaleChunkScriptError(
      scriptErrorEvent(
        "https://us.cloud.langfuse.com/_next/static/chunks/31w9e6884-o68.js",
      ),
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)).toBe("1");
  });

  it("does not reload a second time in the same session", () => {
    const event = scriptErrorEvent(
      "https://us.cloud.langfuse.com/_next/static/chunks/31w9e6884-o68.js",
    );
    handleStaleChunkScriptError(event);
    handleStaleChunkScriptError(event);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a third-party script failure", () => {
    handleStaleChunkScriptError(
      scriptErrorEvent("https://cdn.example.com/vendor.js"),
    );
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)).toBeNull();
  });
});
