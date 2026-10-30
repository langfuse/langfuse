// @vitest-environment node

import { getWebCalloutsStatus } from "./useWebCallouts";

describe("getWebCalloutsStatus", () => {
  it.each([
    [[], undefined],
    [[{ enabled: true }], "active"],
    [[{ enabled: false }, { enabled: true }], "active"],
    [[{ enabled: false }, { enabled: false }], "inactive"],
  ])("maps %o to %s", (endpoints, expected) => {
    expect(getWebCalloutsStatus(endpoints)).toBe(expected);
  });
});
