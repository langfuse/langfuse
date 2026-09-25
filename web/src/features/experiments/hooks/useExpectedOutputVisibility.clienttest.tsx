import { renderHook } from "@testing-library/react";
import { useExpectedOutputVisibility } from "./useExpectedOutputVisibility";

it("does not flash expected output while loading, retains it across pages, and resets for another selection", () => {
  const { result, rerender } = renderHook(
    ({ selection, hasExpectedOutput, loading }) =>
      useExpectedOutputVisibility(selection, hasExpectedOutput, loading),
    {
      initialProps: {
        selection: "first",
        hasExpectedOutput: false,
        loading: true,
      },
    },
  );
  expect(result.current).toBe(false);
  rerender({ selection: "first", hasExpectedOutput: true, loading: false });
  expect(result.current).toBe(true);
  rerender({ selection: "first", hasExpectedOutput: false, loading: true });
  expect(result.current).toBe(true);
  rerender({ selection: "first", hasExpectedOutput: false, loading: false });
  expect(result.current).toBe(true);
  rerender({ selection: "second", hasExpectedOutput: false, loading: true });
  expect(result.current).toBe(false);
});
