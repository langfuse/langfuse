// @vitest-environment node

import { describe, expect, it } from "vitest";
import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { getSuggestedHomePresetIds } from "@/src/features/dashboard/components/home-preset-registry";

describe("Add Widget home-card suggestions", () => {
  it("drops presets that still query the legacy traces view on v4", () => {
    expect(getSuggestedHomePresetIds("v2")).not.toContain(
      "home-latency-table-traces",
    );
    expect(getSuggestedHomePresetIds("v1")).toEqual(HOME_DASHBOARD_PRESET_IDS);
  });
});
