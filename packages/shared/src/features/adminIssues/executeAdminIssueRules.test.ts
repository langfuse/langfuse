import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminIssueDefinition } from "./adminIssueDefinitions";

const { createMany, findFirst, firstRule, secondRule, logError } = vi.hoisted(
  () => ({
    createMany: vi.fn(),
    findFirst: vi.fn(),
    logError: vi.fn(),
    firstRule: vi.fn<NonNullable<AdminIssueDefinition["callback"]>>(),
    secondRule: vi.fn<NonNullable<AdminIssueDefinition["callback"]>>(),
  }),
);

vi.mock("../../db", () => ({
  prisma: { issueLog: { createMany, findFirst } },
}));

vi.mock("../../server/logger", () => ({ logger: { error: logError } }));

vi.mock("./adminIssueDefinitions", () => ({
  adminIssueDefinitions: {
    First: { id: "first", callback: firstRule },
    "Without callback": { id: "without-callback" },
    Second: { id: "second", callback: secondRule },
  },
}));

import { executeAdminIssueRules } from "./executeAdminIssueRules";

describe("executeAdminIssueRules", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(null);
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
          ignoredAt: null,
          ignoreReason: null,
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
          ignoredAt: null,
          ignoreReason: null,
        },
      ],
    });
  });

  it("keeps recreated issues ignored using the latest project-scoped rule state", async () => {
    const ignoredAt = new Date("2026-01-01T00:00:00Z");
    firstRule.mockResolvedValue([{ description: "Recreated", priority: 0 }]);
    findFirst.mockResolvedValue({ ignoredAt, ignoreReason: "Not relevant" });
    createMany.mockResolvedValue({ count: 1 });

    expect(await executeAdminIssueRules("project-a")).toBe(1);

    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { projectId: "project-a", issueDefinitionId: "first" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { ignoredAt: true, ignoreReason: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ ignoredAt, ignoreReason: "Not relevant" }),
      ],
    });
  });

  it("does not revive an older ignore after the latest issue was unignored", async () => {
    firstRule.mockResolvedValue([{ description: "Recreated", priority: 0 }]);
    findFirst.mockResolvedValue({ ignoredAt: null, ignoreReason: null });
    createMany.mockResolvedValue({ count: 1 });

    await executeAdminIssueRules("project-a");

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ignoredAt: null, ignoreReason: null })],
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
