import { describe, expect, it } from "vitest";
import { V4_MIGRATION_TOP_BANNER_MESSAGE } from "./v4MigrationBannerCopy";
import { isV4MigrationTopBannerVisible } from "./topBannerContent";

const visible = {
  severity: "warning",
  message: V4_MIGRATION_TOP_BANNER_MESSAGE,
  v4UpgradeUiEnabled: true,
  isLangfuseCloud: true,
  actionNeededCount: 2,
  isChecking: false,
} as const;

describe("isV4MigrationTopBannerVisible", () => {
  it("shows warning and critical when the org still has legacy usage", () => {
    expect(isV4MigrationTopBannerVisible(visible)).toBe(true);
    expect(
      isV4MigrationTopBannerVisible({ ...visible, severity: "critical" }),
    ).toBe(true);
  });

  it.each([
    ["severity is off", { severity: "off" }],
    [
      "the server state is loading",
      { severity: undefined, message: undefined },
    ],
    ["the message is empty", { message: "  " }],
    ["the v4 upgrade UI is off", { v4UpgradeUiEnabled: false }],
    ["the deployment is self-hosted", { isLangfuseCloud: false }],
    ["no project needs action", { actionNeededCount: 0 }],
    ["project checks are still loading", { isChecking: true }],
  ] as const)("is hidden when %s", (_, override) => {
    expect(isV4MigrationTopBannerVisible({ ...visible, ...override })).toBe(
      false,
    );
  });
});
