import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCorrectionScope } from "./useCorrectionScope";

describe("correction scope", () => {
  it("keeps the trace editor selected when refreshed data adds an observation correction", () => {
    const { result, rerender } = renderHook(useCorrectionScope, {
      initialProps: false,
    });
    expect(result.current[0]).toBe("trace");

    rerender(true);

    expect(result.current[0]).toBe("trace");
  });

  it("keeps the observation editor selected when refreshed data removes its correction", () => {
    const { result, rerender } = renderHook(useCorrectionScope, {
      initialProps: true,
    });
    expect(result.current[0]).toBe("observation");

    rerender(false);

    expect(result.current[0]).toBe("observation");
  });

  it("preserves the user's scope selection through a refresh", () => {
    const { result, rerender } = renderHook(useCorrectionScope, {
      initialProps: true,
    });
    act(() => result.current[1]("trace"));
    rerender(false);
    rerender(true);

    expect(result.current[0]).toBe("trace");
  });
});
