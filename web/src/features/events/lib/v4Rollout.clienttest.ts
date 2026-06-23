import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canToggleV4 } from "./v4Rollout";

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
