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

import {
  buildProjectToOrgMap,
  aggregateByOrg,
} from "../ee/usageThresholds/usageAggregation";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization } from "@langfuse/shared";

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
