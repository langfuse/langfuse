// @vitest-environment node

import { getMixpanelStatus } from "./useMixpanelIntegration";

describe("getMixpanelStatus", () => {
  it.each([
    [null, undefined],
    [{ enabled: true }, "active"],
    [{ enabled: false }, "inactive"],
  ])("maps %o to %s", (config, expected) => {
    expect(getMixpanelStatus(config)).toBe(expected);
  });
});
