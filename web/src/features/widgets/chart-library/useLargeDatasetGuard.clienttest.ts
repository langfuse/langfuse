import { act, renderHook } from "@testing-library/react";
import { useLargeDatasetGuard } from "./useLargeDatasetGuard";

it("warns only above 2,000 points and remembers consent", () => {
  const { result, rerender } = renderHook(
    ({ count }) => useLargeDatasetGuard(count, false),
    { initialProps: { count: 2000 } },
  );
  expect(result.current.shouldWarn).toBe(false);
  rerender({ count: 2001 });
  expect(result.current.shouldWarn).toBe(true);
  act(() => result.current.proceed());
  expect(result.current.shouldWarn).toBe(false);
  rerender({ count: 3000 });
  expect(result.current.shouldWarn).toBe(false);
});

it("allows callers to bypass the warning", () => {
  const { result } = renderHook(() => useLargeDatasetGuard(2001, true));
  expect(result.current.shouldWarn).toBe(false);
});
