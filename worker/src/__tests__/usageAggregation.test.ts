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
    getTraceCountsByProjectAndDay: vi.fn(),
    getObservationCountsByProjectAndDay: vi.fn(),
    getScoreCountsByProjectAndDay: vi.fn(),
    parseDbOrg: vi.fn((org: any) => org), // Pass through by default
  };
});

vi.mock("../ee/usageThresholds/thresholdProcessing", () => ({
  processThresholds: vi.fn(),
}));

vi.mock("../ee/usageThresholds/bulkUpdates", () => ({
  bulkUpdateOrganizationsRawSQL: vi.fn(),
}));

import {
  buildProjectToOrgMap,
  aggregateByOrg,
  processUsageAggregationForAllOrgs,
} from "../ee/usageThresholds/usageAggregation";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization } from "@langfuse/shared";
import {
  getTraceCountsByProjectAndDay,
  getObservationCountsByProjectAndDay,
  getScoreCountsByProjectAndDay,
} from "@langfuse/shared/src/server";
import { processThresholds } from "../ee/usageThresholds/thresholdProcessing";
import { bulkUpdateOrganizationsRawSQL } from "../ee/usageThresholds/bulkUpdates";

const mockProjectFindMany = prisma.project.findMany as Mock;

describe("processUsageAggregationForAllOrgs", () => {
  it("processes a February cycle start on March 30", async () => {
    vi.clearAllMocks();
    mockProjectFindMany.mockResolvedValue([
      { id: "project-1", orgId: "org-end-of-month" },
    ]);
    (prisma.organization.findMany as Mock).mockResolvedValue([
      {
        id: "org-end-of-month",
        createdAt: new Date("2024-01-31T00:00:00.000Z"),
        cloudBillingCycleAnchor: new Date("2024-01-31T00:00:00.000Z"),
      },
    ]);
    (getTraceCountsByProjectAndDay as Mock).mockImplementation(
      async ({ startDate }: { startDate: Date }) =>
        startDate.toISOString() === "2024-02-29T00:00:00.000Z"
          ? [{ count: 7, projectId: "project-1", date: "2024-02-29" }]
          : [],
    );
    (getObservationCountsByProjectAndDay as Mock).mockResolvedValue([]);
    (getScoreCountsByProjectAndDay as Mock).mockResolvedValue([]);
    (processThresholds as Mock).mockResolvedValue({
      actionTaken: "FREE_TIER",
      updateData: {},
    });
    (bulkUpdateOrganizationsRawSQL as Mock).mockResolvedValue({
      successCount: 1,
      failedCount: 0,
      failedOrgIds: [],
    });

    const stats = await processUsageAggregationForAllOrgs(
      new Date("2024-03-30T12:00:00.000Z"),
    );

    expect(stats.totalOrgsProcessed).toBe(1);
    expect(processThresholds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "org-end-of-month" }),
      7,
    );
    expect(getTraceCountsByProjectAndDay).toHaveBeenCalledWith({
      startDate: new Date("2024-02-29T00:00:00.000Z"),
      endDate: new Date("2024-02-29T23:59:59.999Z"),
    });
  });
});

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
  it("aggregates project counts to org level", () => {
    const projectToOrgMap = {
      "proj-1": "org-a",
      "proj-2": "org-a",
      "proj-3": "org-b",
    };

    const traceCounts = [
      { count: 100, projectId: "proj-1", date: "2024-03-01" },
      { count: 200, projectId: "proj-2", date: "2024-03-01" },
      { count: 300, projectId: "proj-3", date: "2024-03-01" },
    ];

    const obsCounts = [
      { count: 50, projectId: "proj-1", date: "2024-03-01" },
      { count: 75, projectId: "proj-3", date: "2024-03-01" },
    ];

    const scoreCounts = [
      { count: 10, projectId: "proj-2", date: "2024-03-01" },
    ];

    const result = aggregateByOrg(
      traceCounts,
      obsCounts,
      scoreCounts,
      projectToOrgMap,
    );

    expect(result).toEqual({
      "org-a": {
        traces: 300, // 100 + 200
        observations: 50,
        scores: 10,
        total: 360,
      },
      "org-b": {
        traces: 300,
        observations: 75,
        scores: 0,
        total: 375,
      },
    });
  });

  it("handles projects not in map (filters them out)", () => {
    const projectToOrgMap = {
      "proj-1": "org-a",
    };

    const traceCounts = [
      { count: 100, projectId: "proj-1", date: "2024-03-01" },
      { count: 200, projectId: "proj-unknown", date: "2024-03-01" },
    ];

    const result = aggregateByOrg(traceCounts, [], [], projectToOrgMap);

    expect(result).toEqual({
      "org-a": {
        traces: 100,
        observations: 0,
        scores: 0,
        total: 100,
      },
    });
    expect(result["org-unknown"]).toBeUndefined();
  });

  it("handles empty counts", () => {
    const projectToOrgMap = {
      "proj-1": "org-a",
    };

    const result = aggregateByOrg([], [], [], projectToOrgMap);

    expect(result).toEqual({});
  });
});

describe("aggregateByOrg edge cases", () => {
  it("handles multiple counts from same project", () => {
    const projectToOrgMap = {
      "proj-1": "org-a",
    };

    // Same project appears multiple times (shouldn't happen in reality but test defensive coding)
    const traceCounts = [
      { count: 100, projectId: "proj-1", date: "2024-03-01" },
      { count: 50, projectId: "proj-1", date: "2024-03-01" },
    ];

    const result = aggregateByOrg(traceCounts, [], [], projectToOrgMap);

    expect(result["org-a"].traces).toBe(150); // Should sum both
  });

  it("calculates total correctly across all types", () => {
    const projectToOrgMap = {
      "proj-1": "org-a",
    };

    const traceCounts = [
      { count: 1000, projectId: "proj-1", date: "2024-03-01" },
    ];
    const obsCounts = [
      { count: 2000, projectId: "proj-1", date: "2024-03-01" },
    ];
    const scoreCounts = [
      { count: 3000, projectId: "proj-1", date: "2024-03-01" },
    ];

    const result = aggregateByOrg(
      traceCounts,
      obsCounts,
      scoreCounts,
      projectToOrgMap,
    );

    expect(result["org-a"]).toEqual({
      traces: 1000,
      observations: 2000,
      scores: 3000,
      total: 6000,
    });
  });
});
