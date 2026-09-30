import { beforeEach, describe, expect, it, vi } from "vitest";

const { findBlobStorage, findPosthog } = vi.hoisted(() => ({
  findBlobStorage: vi.fn(),
  findPosthog: vi.fn(),
}));

vi.mock("../../../db", () => ({
  prisma: {
    blobStorageIntegration: { findFirst: findBlobStorage },
    posthogIntegration: { findFirst: findPosthog },
  },
}));

import { integrationDisabledAfterErrorRule } from "./integrationDisabledAfterError";

describe("integrationDisabledAfterErrorRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findBlobStorage.mockResolvedValue(null);
    findPosthog.mockResolvedValue(null);
  });

  it("reports each integration disabled after an error", async () => {
    findBlobStorage.mockResolvedValue({
      lastError: "The specified bucket\ndoes not `exist`",
    });
    findPosthog.mockResolvedValue({ lastError: "Invalid PostHog hostname" });

    const issues =
      await integrationDisabledAfterErrorRule.callback!("project-a");

    expect(issues).toEqual([
      {
        description: expect.stringContaining(
          "Blob storage export is disabled after the last export failed with `The specified bucket does not 'exist'`",
        ),
        priority: 1,
        ctaLink: "/project/project-a/settings/integrations/blobstorage",
      },
      {
        description: expect.stringContaining(
          "PostHog export is disabled after the last export failed with `Invalid PostHog hostname`",
        ),
        priority: 1,
        ctaLink: "/project/project-a/settings/integrations/posthog",
      },
    ]);
    const query = {
      where: {
        projectId: "project-a",
        enabled: false,
        lastError: { not: null },
      },
      select: { lastError: true },
    };
    expect(findBlobStorage).toHaveBeenCalledWith(query);
    expect(findPosthog).toHaveBeenCalledWith(query);
  });

  it("truncates long errors", async () => {
    findPosthog.mockResolvedValue({ lastError: "x".repeat(1000) });

    const [issue] =
      await integrationDisabledAfterErrorRule.callback!("project-a");

    expect(issue.description).toContain(`\`${"x".repeat(300)}…\``);
    expect(issue.description).not.toContain("x".repeat(301));
  });

  it("returns no issue when no integration is disabled after an error", async () => {
    expect(
      await integrationDisabledAfterErrorRule.callback!("project-a"),
    ).toEqual([]);
  });
});
