import { describe, expect, it, vi } from "vitest";

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
  redis: null,
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
}));

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US" },
}));

vi.mock("@/src/features/posthog-analytics/ServerPosthog", () => ({
  ServerPosthog: class {
    capture() {}
  },
}));

import { createBackendActivityTracker } from "@/src/features/posthog-analytics/server/backendActivity";

const createTracker = (
  options: {
    cloudRegion?: string;
    now?: Date;
    wasFirstActivity?: boolean;
  } = {},
) => {
  const cloudRegion = Object.hasOwn(options, "cloudRegion")
    ? options.cloudRegion
    : "US";
  const now = options.now ?? new Date("2026-08-10T12:00:00.000Z");
  const wasFirstActivity = options.wasFirstActivity ?? true;
  const capture = vi.fn();
  const setIfAbsent = vi.fn().mockResolvedValue(wasFirstActivity);
  const tracker = createBackendActivityTracker({
    capture,
    cloudRegion,
    now: () => now,
    setIfAbsent,
  });

  return { capture, setIfAbsent, tracker };
};

describe("backend activity tracking", () => {
  it("captures a project-scoped activity event once per UTC day", async () => {
    const { capture, setIfAbsent, tracker } = createTracker();

    await tracker({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });
    await tracker({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });

    expect(setIfAbsent).toHaveBeenCalledOnce();
    expect(setIfAbsent).toHaveBeenCalledWith(
      "langfuse:backend-activity:2026-08-10:user-1:project:project-1",
      172_800,
    );
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith({
      distinctId: "user-1",
      event: "backend:activity",
      properties: {
        activityScope: "project",
        cloudRegion: "US",
        organizationId: "org-1",
        projectId: "project-1",
      },
      timestamp: new Date("2026-08-10T12:00:00.000Z"),
      disableGeoip: true,
    });
  });

  it("tracks organization activity separately from project activity", async () => {
    const { capture, setIfAbsent, tracker } = createTracker();

    await tracker({ userId: "user-1", organizationId: "org-1" });
    await tracker({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });

    expect(setIfAbsent).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        properties: {
          activityScope: "organization",
          cloudRegion: "US",
          organizationId: "org-1",
        },
      }),
    );
    expect(capture).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        properties: {
          activityScope: "project",
          cloudRegion: "US",
          organizationId: "org-1",
          projectId: "project-1",
        },
      }),
    );
  });

  it("captures the same project again on the next UTC day", async () => {
    let now = new Date("2026-08-10T23:59:59.000Z");
    const capture = vi.fn();
    const setIfAbsent = vi.fn().mockResolvedValue(true);
    const tracker = createBackendActivityTracker({
      capture,
      cloudRegion: "US",
      now: () => now,
      setIfAbsent,
    });

    await tracker({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });
    now = new Date("2026-08-11T00:00:01.000Z");
    await tracker({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });

    expect(setIfAbsent).toHaveBeenCalledTimes(2);
    expect(setIfAbsent).toHaveBeenNthCalledWith(
      1,
      "langfuse:backend-activity:2026-08-10:user-1:project:project-1",
      172_800,
    );
    expect(setIfAbsent).toHaveBeenNthCalledWith(
      2,
      "langfuse:backend-activity:2026-08-11:user-1:project:project-1",
      172_800,
    );
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("does not capture when another server already recorded the activity", async () => {
    const { capture, setIfAbsent, tracker } = createTracker({
      wasFirstActivity: false,
    });

    await tracker({ userId: "user-1", organizationId: "org-1" });
    await tracker({ userId: "user-1", organizationId: "org-1" });

    expect(setIfAbsent).toHaveBeenCalledOnce();
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not track outside Langfuse Cloud", async () => {
    const { capture, setIfAbsent, tracker } = createTracker({
      cloudRegion: undefined,
    });

    await tracker({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
    });

    expect(setIfAbsent).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("keeps tracking failures off the authenticated API path", async () => {
    const capture = vi.fn();
    const tracker = createBackendActivityTracker({
      capture,
      cloudRegion: "US",
      now: () => new Date("2026-08-10T12:00:00.000Z"),
      setIfAbsent: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    });

    await expect(
      tracker({ userId: "user-1", organizationId: "org-1" }),
    ).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });

  it("keeps PostHog capture failures off the authenticated API path", async () => {
    const tracker = createBackendActivityTracker({
      capture: vi.fn(() => {
        throw new Error("PostHog unavailable");
      }),
      cloudRegion: "US",
      now: () => new Date("2026-08-10T12:00:00.000Z"),
      setIfAbsent: vi.fn().mockResolvedValue(true),
    });

    await expect(
      tracker({ userId: "user-1", organizationId: "org-1" }),
    ).resolves.toBeUndefined();
  });
});
