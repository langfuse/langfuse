import { beforeEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("../../db", () => ({
  prisma: { issueLog: { create } },
}));

import { createAdminIssue } from "./createAdminIssue";

describe("createAdminIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      },
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
