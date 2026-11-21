import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardCardTabs } from "./useDashboardCardTabs";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

describe("useDashboardCardTabs", () => {
  beforeEach(() => capture.mockClear());

  it("selects tabs and tracks their labels", () => {
    const items = [
      { tabTitle: "Traces" },
      { tabTitle: "Observations" },
    ] as const;
    const { result } = renderHook(() => useDashboardCardTabs(items));
    expect(result.current.selectedItem).toBe(items[0]);
    expect(result.current.tabs.options).toEqual([
      { value: "0", label: "Traces" },
      { value: "1", label: "Observations" },
    ]);
    act(() => result.current.tabs.onValueChange("1"));
    expect(result.current.selectedItem).toBe(items[1]);
    expect(result.current.tabs.value).toBe("1");
    expect(capture).toHaveBeenCalledWith("dashboard:chart_tab_switch", {
      tabLabel: "Observations",
    });
  });

  it("falls back when the selected tab disappears", () => {
    const { result, rerender } = renderHook(
      ({ showObservations }) =>
        useDashboardCardTabs(
          showObservations
            ? [{ tabTitle: "Traces" }, { tabTitle: "Observations" }]
            : [{ tabTitle: "Traces" }],
        ),
      { initialProps: { showObservations: true } },
    );
    act(() => result.current.tabs.onValueChange("1"));
    rerender({ showObservations: false });
    expect(result.current.selectedItem.tabTitle).toBe("Traces");
    expect(result.current.tabs.value).toBe("0");
    expect(result.current.selectedIndex).toBe(0);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid selections", () => {
    const { result } = renderHook(() =>
      useDashboardCardTabs([{ tabTitle: "Traces" }]),
    );
    for (const value of ["-1", "1", "invalid", "0.5"]) {
      act(() => result.current.tabs.onValueChange(value));
    }
    expect(result.current.tabs.value).toBe("0");
    expect(capture).not.toHaveBeenCalled();
  });
});
