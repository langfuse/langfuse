import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, findFirst } = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("../../db", () => ({
  prisma: { issueLog: { create, findFirst } },
}));

import { createAdminIssue } from "./createAdminIssue";

describe("createAdminIssue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(null);
  });

  it("writes each oversized request under its registered issue ID", async () => {
    const input = {
      projectId: "project-a",
      name: "Oversized ingestion request" as const,
      issue: { description: "Request exceeded 4 MiB", priority: 2 as const },
    };

    await createAdminIssue(input);
    await createAdminIssue(input);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      data: {
        projectId: "project-a",
        issueDefinitionId: "oversized-ingestion-request",
        description: "Request exceeded 4 MiB",
        priority: 2,
        ctaLink: undefined,
        ignoredAt: null,
        ignoreReason: null,
      },
    });
  });

  it("keeps event-driven issues ignored when their latest occurrence was ignored", async () => {
    const ignoredAt = new Date("2026-01-01T00:00:00Z");
    findFirst.mockResolvedValue({ ignoredAt, ignoreReason: "Expected" });

    await createAdminIssue({
      projectId: "project-a",
      name: "Oversized ingestion request",
      issue: { description: "Another oversized request", priority: 2 },
    });

    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        projectId: "project-a",
        issueDefinitionId: "oversized-ingestion-request",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { ignoredAt: true, ignoreReason: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ignoredAt, ignoreReason: "Expected" }),
    });
  });

  it("rejects names missing from the registry", async () => {
    await expect(
      createAdminIssue({
        projectId: "project-a",
        name: "toString" as "Oversized ingestion request",
        issue: { description: "Unknown issue", priority: 2 },
      }),
    ).rejects.toThrow("Unknown admin issue name: toString");
    expect(create).not.toHaveBeenCalled();
  });
});
