// @vitest-environment node

import { getPostHogStatus } from "./usePostHogIntegration";

describe("getPostHogStatus", () => {
  it.each([
    [null, "inactive"],
    [{ enabled: true, lastError: null }, "active"],
    [{ enabled: false, lastError: null }, "inactive"],
    [{ enabled: false, lastError: "Invalid hostname" }, "error"],
  ])("maps %o to %s", (config, expected) => {
    expect(getPostHogStatus(config)).toBe(expected);
  });
});
