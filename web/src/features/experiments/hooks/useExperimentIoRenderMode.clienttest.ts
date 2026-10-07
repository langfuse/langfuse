import { act, renderHook } from "@testing-library/react";

import { useExperimentIoRenderMode } from "./useExperimentIoRenderMode";

const storageKey = "experiment-itemsIoRenderMode";

describe("useExperimentIoRenderMode", () => {
  beforeEach(() => localStorage.removeItem(storageKey));
  afterEach(() => localStorage.removeItem(storageKey));

  it.each(["json", "text", "formatted"] as const)(
    "restores the saved %s preference from the existing storage key",
    (mode) => {
      localStorage.setItem(storageKey, JSON.stringify(mode));

      const { result } = renderHook(() => useExperimentIoRenderMode());

      expect(result.current[0]).toBe(mode);
    },
  );

  it("persists Formatted across remounts without changing another table", () => {
    localStorage.setItem(storageKey, JSON.stringify("text"));
    localStorage.setItem("tracesIoRenderMode", JSON.stringify("json"));
    const first = renderHook(() => useExperimentIoRenderMode());

    act(() => first.result.current[1]("formatted"));
    expect(localStorage.getItem(storageKey)).toBe(JSON.stringify("formatted"));
    first.unmount();

    const restored = renderHook(() => useExperimentIoRenderMode());
    expect(restored.result.current[0]).toBe("formatted");
    expect(localStorage.getItem("tracesIoRenderMode")).toBe(
      JSON.stringify("json"),
    );
    localStorage.removeItem("tracesIoRenderMode");
  });
});
