import { describe, expect, it } from "vitest";
import {
  isV4MigrationTopBannerVisible,
  renderV4BannerMessage,
} from "./topBannerContent";

const visible = {
  severity: "warning",
  message:
    "Legacy v3 is still in use in {projects}. Trace-level evals and exports stop on November 16.",
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

describe("renderV4BannerMessage", () => {
  it("replaces {projects} with the org-wide count", () => {
    const template =
      "Legacy v3 is still in use in {projects}. Trace-level evals and exports stop on November 16.";
    expect(renderV4BannerMessage(template, 1)).toBe(
      "Legacy v3 is still in use in 1 project. Trace-level evals and exports stop on November 16.",
    );
    expect(renderV4BannerMessage(template, 3)).toBe(
      "Legacy v3 is still in use in 3 projects. Trace-level evals and exports stop on November 16.",
    );
  });

  it("leaves a message without the placeholder unchanged, including markup", () => {
    const message = "Legacy v3 is paused today, 16:00 to 17:00 CET.";
    expect(renderV4BannerMessage(message, 3)).toBe(message);
    expect(renderV4BannerMessage("Use <b>v4</b> now.", 2)).toBe(
      "Use <b>v4</b> now.",
    );
  });

  it("replaces every {projects} token and no other brace", () => {
    expect(renderV4BannerMessage("{projects} and {projects}, {other}", 2)).toBe(
      "2 projects and 2 projects, {other}",
    );
  });
});
