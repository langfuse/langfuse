import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminIssueDefinition } from "./adminIssueDefinitions";

const { createMany, firstRule, secondRule, logError } = vi.hoisted(() => ({
  createMany: vi.fn(),
  logError: vi.fn(),
  firstRule: vi.fn<NonNullable<AdminIssueDefinition["callback"]>>(),
  secondRule: vi.fn<NonNullable<AdminIssueDefinition["callback"]>>(),
}));

vi.mock("../../db", () => ({
  prisma: { issueLog: { createMany } },
}));

vi.mock("../../server/logger", () => ({ logger: { error: logError } }));

vi.mock("./adminIssueDefinitions", () => ({
  adminIssueDefinitions: [
    { id: "first", callback: firstRule },
    { id: "without-callback" },
    { id: "second", callback: secondRule },
  ],
}));

import { executeAdminIssueRules } from "./executeAdminIssueRules";

describe("executeAdminIssueRules", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firstRule.mockResolvedValue([]);
    secondRule.mockResolvedValue([]);
  });

  it("runs callbacks concurrently and saves their project-scoped results", async () => {
    let releaseFirstRule!: () => void;
    const firstRuleGate = new Promise<void>((resolve) => {
      releaseFirstRule = resolve;
    });
    firstRule.mockImplementation(async () => {
      await firstRuleGate;
      return [{ description: "First issue", priority: 0 }];
    });
    secondRule.mockImplementation(async () => {
      releaseFirstRule();
      return [
        { description: "Second issue", priority: 5, ctaLink: "/settings" },
      ];
    });
    createMany.mockImplementation(async ({ data }) => ({ count: data.length }));

    expect(await executeAdminIssueRules("project-a")).toBe(2);

    expect(firstRule).toHaveBeenCalledWith("project-a");
    expect(secondRule).toHaveBeenCalledWith("project-a");
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          projectId: "project-a",
          issueDefinitionId: "first",
          description: "First issue",
          priority: 0,
          ctaLink: undefined,
        },
      ],
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
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

  it("isolates callback failures and saves successful rule results", async () => {
    firstRule.mockResolvedValue([{ description: "First issue", priority: 0 }]);
    secondRule.mockRejectedValue(new Error("Query failed"));
    createMany.mockResolvedValue({ count: 1 });

    expect(await executeAdminIssueRules("project-a")).toBe(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "Failed to execute admin issue rule",
      expect.objectContaining({
        projectId: "project-a",
        issueDefinitionId: "second",
        errorMessage: "Query failed",
        errorStack: expect.any(String),
      }),
    );
  });

  it("isolates persistence failures between rules", async () => {
    firstRule.mockResolvedValue([{ description: "First issue", priority: 0 }]);
    secondRule.mockResolvedValue([
      { description: "Second issue", priority: 5 },
    ]);
    createMany.mockRejectedValueOnce(new Error("Write failed"));
    createMany.mockResolvedValueOnce({ count: 1 });

    expect(await executeAdminIssueRules("project-a")).toBe(1);
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
