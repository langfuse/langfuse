// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canToggleV4, isV4UpgradeUiAvailable } from "./v4Rollout";

describe("canToggleV4", () => {
  const originalRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  // A user/org created after the rollout date is auto-enabled, so the toggle
  // is hidden for them under the normal date-based rollout.
  const postRolloutContext = {
    organizations: [
      { id: "org-new", createdAt: new Date("2026-05-01T00:00:00.000Z") },
    ],
  };

  beforeEach(() => {
    // Force a non-DEV cloud region so the DEV short-circuit does not apply.
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
  });

  it("hides the toggle for a new (auto-enabled) non-admin user", () => {
    expect(canToggleV4(postRolloutContext)).toBe(false);
  });

  it("always allows the toggle for a Langfuse Cloud admin, even when new", () => {
    expect(
      canToggleV4(postRolloutContext, { isLangfuseCloudAdmin: true }),
    ).toBe(true);
  });

  it("does not change behavior for a non-admin when the flag is false", () => {
    expect(
      canToggleV4(postRolloutContext, { isLangfuseCloudAdmin: false }),
    ).toBe(false);
  });
});

describe("isV4UpgradeUiAvailable", () => {
  // dualPreviewAvailable mirrors auth.ts: Cloud always has it, self-hosted only
  // with LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN=true.
  const availability = (
    isLangfuseCloud: boolean,
    v4WriteMode: "legacy" | "dual" | "events_only",
    allowPreviewOptIn = false,
  ) =>
    isV4UpgradeUiAvailable({
      isLangfuseCloud,
      v4WriteMode,
      dualPreviewAvailable: isLangfuseCloud || allowPreviewOptIn,
    });

  it("is on for Langfuse Cloud on dual and events_only", () => {
    expect(availability(true, "dual")).toBe(true);
    expect(availability(true, "events_only")).toBe(true);
  });

  it("is on for a self-hosted dual deployment that allows the preview opt-in", () => {
    expect(availability(false, "dual", true)).toBe(true);
  });

  it("is off for a self-hosted dual deployment without the preview opt-in", () => {
    // Nobody on the deployment can move onto the v4 read path, so every call to
    // action in the migration UI would be a dead end.
    expect(availability(false, "dual", false)).toBe(false);
  });

  it("is off for a self-hosted events_only deployment", () => {
    // The migration is already over: legacy API routes 404, legacy evaluators
    // are hidden and the legacy analytics integrations are no-ops.
    expect(availability(false, "events_only", true)).toBe(false);
  });

  it("is off on legacy regardless of deployment or opt-in", () => {
    // The events tables the migration surfaces read are not written.
    expect(availability(true, "legacy")).toBe(false);
    expect(availability(false, "legacy", true)).toBe(false);
  });
});
