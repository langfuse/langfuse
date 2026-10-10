import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "@langfuse/shared";

import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import { getCacheKey } from "./keys";
import {
  cloneWindowState,
  getWindowState,
  safeSessionStorageSetItem,
  setWindowState,
} from "./windowStorage";
import { type PlaygroundCache } from "../types";

const sampleCache: PlaygroundCache = {
  messages: [
    {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: "hello",
    } as ChatMessage,
  ],
};

const quotaExceeded = () =>
  new DOMException("The quota has been exceeded.", "QuotaExceededError");

// Playground persist is best-effort: a sessionStorage write that throws
// (quota exceeded, Safari private mode) must not propagate an exception and
// must not log at error level — the Sentry console integration turns
// console.error into events (the QuotaExceededError issue family).
describe("playground sessionStorage writes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("persists when the write succeeds", () => {
    expect(safeSessionStorageSetItem("k", "v")).toBe(true);
    expect(sessionStorage.getItem("k")).toBe("v");
  });

  it("does not throw and warns (not errors) when the write fails", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaExceeded();
    });

    expect(safeSessionStorageSetItem("k", "v")).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("clones window state when storage accepts the write", () => {
    sessionStorage.setItem(getCacheKey("source"), JSON.stringify(sampleCache));

    expect(cloneWindowState("source", "target")).toBe(true);
    expect(getWindowState("target")).toEqual(sampleCache);
  });

  it("does not throw or console.error when cloning hits quota", () => {
    sessionStorage.setItem(getCacheKey("source"), JSON.stringify(sampleCache));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaExceeded();
    });

    expect(cloneWindowState("source", "target")).toBe(false);
    expect(getWindowState("target")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not throw or console.error when setWindowState hits quota", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaExceeded();
    });

    expect(setWindowState("w1", sampleCache)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns true when persisting playground cache succeeds", () => {
    const { result } = renderHook(() => usePlaygroundCache("win-ok"));

    expect(result.current.setPlaygroundCache(sampleCache)).toBe(true);
    expect(sessionStorage.getItem(getCacheKey("win-ok"))).toBe(
      JSON.stringify(sampleCache),
    );
  });

  it("does not throw or console.error when persisting playground cache hits quota", () => {
    const { result } = renderHook(() => usePlaygroundCache("win-1"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaExceeded();
    });

    expect(result.current.setPlaygroundCache(sampleCache)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
