import { beforeEach, describe, expect, it } from "vitest";

import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";

describe("globalDateRangeStore", () => {
  beforeEach(() => {
    useGlobalDateRangeStore.setState({ defaultsByProject: {} });
  });

  it("stores a project's default in relative meta-format", () => {
    useGlobalDateRangeStore.getState().actions.setProjectDefault("projA", "7d");
    expect(useGlobalDateRangeStore.getState().defaultsByProject).toEqual({
      projA: "7d",
    });
  });

  it("scopes defaults per project — one project never clobbers another", () => {
    const { setProjectDefault } = useGlobalDateRangeStore.getState().actions;
    setProjectDefault("projA", "7d");
    setProjectDefault("projB", "30d");
    // Re-setting A must not touch B (the project-switch clobber regression).
    setProjectDefault("projA", "1h");

    expect(useGlobalDateRangeStore.getState().defaultsByProject).toEqual({
      projA: "1h",
      projB: "30d",
    });
  });
});
