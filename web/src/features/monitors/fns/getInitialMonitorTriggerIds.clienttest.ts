// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getInitialMonitorTriggerIds } from "./getInitialMonitorTriggerIds";

describe("getInitialMonitorTriggerIds", () => {
  it("selects the first available automation", () => {
    expect(
      getInitialMonitorTriggerIds([
        { trigger: { id: "trigger-1" } },
        { trigger: { id: "trigger-2" } },
      ] as Parameters<typeof getInitialMonitorTriggerIds>[0]),
    ).toEqual(["trigger-1"]);
  });

  it("returns no selection without an available automation", () => {
    expect(getInitialMonitorTriggerIds([])).toEqual([]);
  });
});
