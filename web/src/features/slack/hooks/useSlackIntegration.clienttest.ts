// @vitest-environment node

import { getSlackStatus } from "./useSlackIntegration";

describe("getSlackStatus", () => {
  it.each([
    [undefined, "inactive"],
    [{ isConnected: false }, "inactive"],
    [{ isConnected: true }, "active"],
  ])("maps %o to %s", (integration, expected) => {
    expect(getSlackStatus(integration)).toBe(expected);
  });
});
