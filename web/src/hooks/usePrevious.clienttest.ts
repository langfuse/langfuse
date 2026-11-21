import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePrevious } from "./usePrevious";

describe("usePrevious", () => {
  it("returns the previous committed value by default", () => {
    const { result, rerender } = renderHook((value) => usePrevious(value), {
      initialProps: "first",
    });
    expect(result.current).toBeUndefined();
    rerender("second");
    expect(result.current).toBe("first");
    rerender("third");
    expect(result.current).toBe("second");
  });

  it("retains the last saved value across consecutive skipped renders", () => {
    const { result, rerender } = renderHook(
      ({ value, valid }) => usePrevious(value, valid),
      { initialProps: { value: "invalid", valid: false } },
    );
    expect(result.current).toBeUndefined();
    rerender({ value: "first valid", valid: true });
    expect(result.current).toBeUndefined();
    rerender({ value: "invalid", valid: false });
    expect(result.current).toBe("first valid");
    rerender({ value: "still invalid", valid: false });
    expect(result.current).toBe("first valid");
    rerender({ value: "second valid", valid: true });
    rerender({ value: "invalid again", valid: false });
    expect(result.current).toBe("second valid");
  });
});
