import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminIssueDefinition } from "./adminIssueDefinition";

const { createMany, firstRule, secondRule } = vi.hoisted(() => ({
  createMany: vi.fn(),
  firstRule: vi.fn<AdminIssueDefinition["callback"]>(),
  secondRule: vi.fn<AdminIssueDefinition["callback"]>(),
}));

vi.mock("../../db", () => ({
  prisma: { issueLog: { createMany } },
}));

vi.mock("./adminIssueDefinitions", () => ({
  adminIssueDefinitions: {
    first: { id: "first", callback: firstRule },
    second: { id: "second", callback: secondRule },
  },
}));

import { executeAdminIssueRules } from "./executeAdminIssueRules";

describe("executeAdminIssueRules", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firstRule.mockResolvedValue([]);
    secondRule.mockResolvedValue([]);
  });

  it("attributes results to the project and rule and inserts again on repeated runs", async () => {
    firstRule.mockResolvedValue([{ description: "First issue", priority: 0 }]);
    secondRule.mockResolvedValue([
      { description: "Second issue", priority: 5, ctaLink: "/settings" },
    ]);
    createMany.mockResolvedValue({ count: 2 });

    expect(await executeAdminIssueRules("project-a")).toBe(2);
    expect(await executeAdminIssueRules("project-a")).toBe(2);

    expect(firstRule).toHaveBeenCalledWith({ projectId: "project-a" });
    expect(secondRule).toHaveBeenCalledWith({ projectId: "project-a" });
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenLastCalledWith({
      data: [
        {
          projectId: "project-a",
          issueDefinitionId: "first",
          description: "First issue",
          priority: 0,
          ctaLink: undefined,
        },
        {
          projectId: "project-a",
          issueDefinitionId: "second",
          description: "Second issue",
          priority: 5,
          ctaLink: "/settings",
        },
      ],
    });
  });

  it("does not write when no rules detect issues", async () => {
    expect(await executeAdminIssueRules("project-a")).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("propagates rule failures without persisting partial results", async () => {
    firstRule.mockResolvedValue([{ description: "First issue", priority: 0 }]);
    secondRule.mockRejectedValue(new Error("Query failed"));

    await expect(executeAdminIssueRules("project-a")).rejects.toThrow(
      "Query failed",
    );
    expect(createMany).not.toHaveBeenCalled();
  });
});
