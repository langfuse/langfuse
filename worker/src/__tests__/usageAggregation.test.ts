import { describe, it, expect, beforeEach, vi } from "vitest";
import { type Mock } from "vitest";

// Mock prisma
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
    },
    organization: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock Clickhouse repository functions and parseDbOrg
vi.mock("@langfuse/shared/src/server", async () => {
  const originalModule = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    getBillableUnitCountsForAllProjectsInRange: vi.fn(),
    parseDbOrg: vi.fn((org: any) => org), // Pass through by default
  };
});

import {
  buildProjectToOrgMap,
  aggregateByOrg,
} from "../ee/usageThresholds/usageAggregation";
import { prisma } from "@langfuse/shared/src/db";

const mockProjectFindMany = prisma.project.findMany as Mock;

describe("buildProjectToOrgMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds correct map of projectId to orgId", async () => {
    mockProjectFindMany.mockResolvedValue([
      { id: "proj-1", orgId: "org-a" } as any,
      { id: "proj-2", orgId: "org-a" } as any,
      { id: "proj-3", orgId: "org-b" } as any,
    ]);

    const map = await buildProjectToOrgMap();

    expect(map).toEqual({
      "proj-1": "org-a",
      "proj-2": "org-a",
      "proj-3": "org-b",
    });
  });

  it("handles empty project list", async () => {
    mockProjectFindMany.mockResolvedValue([]);

    const map = await buildProjectToOrgMap();

    expect(map).toEqual({});
  });
});

describe("aggregateByOrg", () => {
  it("sums project counts of every unit type to org level", () => {
    const projectToOrgMap = {
      "proj-1": "org-a",
      "proj-2": "org-a",
      "proj-3": "org-b",
    };

    const unitCounts = [
      { count: 100, projectId: "proj-1" },
      { count: 50, projectId: "proj-1" },
      { count: 200, projectId: "proj-2" },
      { count: 300, projectId: "proj-3" },
    ];

    expect(aggregateByOrg(unitCounts, projectToOrgMap)).toEqual({
      "org-a": 350,
      "org-b": 300,
    });
  });

  it("drops projects not in the map", () => {
    const result = aggregateByOrg(
      [
        { count: 100, projectId: "proj-1" },
        { count: 200, projectId: "proj-unknown" },
      ],
      { "proj-1": "org-a" },
    );

    expect(result).toEqual({ "org-a": 100 });
  });

  it("handles empty counts", () => {
    expect(aggregateByOrg([], { "proj-1": "org-a" })).toEqual({});
  });
});
