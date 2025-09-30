/** @jest-environment node */

// Mock prisma
jest.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
    },
    organization: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock Clickhouse repository functions and parseDbOrg
jest.mock("@langfuse/shared/src/server", () => {
  const originalModule = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    getTraceCountsByProjectAndDay: jest.fn(),
    getObservationCountsByProjectAndDay: jest.fn(),
    getScoreCountsByProjectAndDay: jest.fn(),
    parseDbOrg: jest.fn((org) => org), // Pass through by default
  };
});

import {
  buildProjectToOrgMap,
  aggregateByOrg,
  calculateBillingStartsForAllOrgs,
} from "@/src/ee/features/usage-thresholds/services/usageAggregation";
import { prisma } from "@langfuse/shared/src/db";
import { type ParsedOrganization } from "@langfuse/shared";

const mockProjectFindMany = prisma.project.findMany as jest.MockedFunction<
  typeof prisma.project.findMany
>;

describe("buildProjectToOrgMap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

describe("calculateBillingStartsForAllOrgs", () => {
  it("calculates billing cycle start for each org", () => {
    const orgs: ParsedOrganization[] = [
      {
        id: "org-1",
        name: "org-1",
        cloudConfig: null,
        metadata: null,
        billingCycleLastUpdatedAt: null,
        billingCycleLastUsage: null,
        billingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "org-2",
        name: "org-2",
        cloudConfig: null,
        metadata: null,
        billingCycleLastUpdatedAt: null,
        billingCycleLastUsage: null,
        billingCycleAnchor: null,
        updatedAt: new Date("2024-02-01T00:00:00Z"),
        createdAt: new Date("2024-02-01T00:00:00Z"),
      },
    ];

    const referenceDate = new Date("2024-03-20T10:00:00Z");
    const result = calculateBillingStartsForAllOrgs(orgs, referenceDate);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("org-1");
    expect(result[0].billingCycleStartForReference).toEqual(
      new Date("2024-03-15T00:00:00Z"),
    );

    expect(result[1].id).toBe("org-2");
    expect(result[1].billingCycleStartForReference).toEqual(
      new Date("2024-03-01T00:00:00Z"),
    );
  });

  it("handles org with billing cycle anchor on 31st (month boundary)", () => {
    const orgs: ParsedOrganization[] = [
      {
        id: "org-1",
        name: "org-1",
        cloudConfig: null,
        metadata: null,
        billingCycleLastUpdatedAt: null,
        billingCycleLastUsage: null,
        billingCycleAnchor: new Date("2024-01-31T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
    ];

    // Reference in February (leap year, 29 days)
    const referenceDate = new Date("2024-03-05T10:00:00Z");
    const result = calculateBillingStartsForAllOrgs(orgs, referenceDate);

    // Should adjust to Feb 29 (last day of Feb in leap year)
    expect(result[0].billingCycleStartForReference).toEqual(
      new Date("2024-02-29T00:00:00Z"),
    );
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
