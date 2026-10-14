import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useScrollGradients } from "./useScrollGradients";

class Observer {
  observe() {}
  disconnect() {}
}

describe("useScrollGradients", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("measures a viewport registered after mount", () => {
    vi.stubGlobal("ResizeObserver", Observer);
    vi.stubGlobal("MutationObserver", Observer);

    const { result } = renderHook(() =>
      useScrollGradients<HTMLDivElement>(true),
    );
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    });

    act(() => {
      result.current.register(viewport);
    });

    expect(result.current.top).toBe(false);
    expect(result.current.bottom).toBe(true);
  });
});
