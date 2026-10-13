// @vitest-environment node

import { getSlackStatus } from "./useSlackIntegration";

describe("getSlackStatus", () => {
  it.each([
    [{ isConnected: false, teamId: null }, undefined],
    [{ isConnected: true, teamId: "T123" }, "active"],
    [{ isConnected: false, teamId: "T123" }, "error"],
  ])("maps %o to %s", (integration, expected) => {
    expect(getSlackStatus(integration)).toBe(expected);
  });
});
