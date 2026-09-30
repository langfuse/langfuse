// @vitest-environment jsdom

import {
  handleStaleChunkScriptError,
  isStaleNextScriptElement,
  STALE_CHUNK_RELOAD_SESSION_KEY,
} from "@/src/features/version-update/reloadOnStaleChunk";

const NEXT_CHUNK =
  "https://us.cloud.langfuse.com/_next/static/chunks/31w9e6884-o68.js";

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
    script.src = NEXT_CHUNK;
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
  const mismatch = () => true;

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

  it("reloads once when a Next chunk fails after a version mismatch", () => {
    handleStaleChunkScriptError(scriptErrorEvent(NEXT_CHUNK), mismatch);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)).toBe("1");
  });

  it("does not reload a second time in the same session", () => {
    const event = scriptErrorEvent(NEXT_CHUNK);
    handleStaleChunkScriptError(event, mismatch);
    handleStaleChunkScriptError(event, mismatch);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload without an observed version mismatch", () => {
    handleStaleChunkScriptError(scriptErrorEvent(NEXT_CHUNK), () => false);
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)).toBeNull();
  });

  it("does not reload a third-party script failure", () => {
    handleStaleChunkScriptError(
      scriptErrorEvent("https://cdn.example.com/vendor.js"),
      mismatch,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STALE_CHUNK_RELOAD_SESSION_KEY)).toBeNull();
  });
});
