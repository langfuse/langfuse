import { expect, describe, it, beforeAll, afterEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { backfillValidToForDatasetItems } from "../backgroundMigrations/utils/datasetItems";

const t0 = new Date("2024-01-01T00:00:00Z");
const t1 = new Date("2024-01-01T01:00:00Z");
const t2 = new Date("2024-01-01T02:00:00Z");
const t3 = new Date("2024-01-01T03:00:00Z");
const t4 = new Date("2024-01-01T04:00:00Z");

const datasetId1 = "dataset-1";
const datasetId2 = "dataset-2";

const items = [
  {
    id: "1",
    projectId: "A",
    validFrom: t0,
    validTo: null,
    datasetId: datasetId1,
  },
  {
    id: "1",
    projectId: "A",
    validFrom: t1,
    validTo: null,
    datasetId: datasetId1,
  },
  {
    id: "1",
    projectId: "A",
    validFrom: t4,
    validTo: null,
    datasetId: datasetId1,
  },
  {
    id: "2",
    projectId: "A",
    validFrom: t2,
    validTo: null,
    datasetId: datasetId1,
  },
  {
    id: "3",
    projectId: "A",
    validFrom: t0,
    validTo: null,
    datasetId: datasetId1,
  },
  {
    id: "3",
    projectId: "A",
    validFrom: t3,
    validTo: null,
    datasetId: datasetId1,
  },
  {
    id: "4",
    projectId: "B",
    validFrom: t4,
    validTo: null,
    datasetId: datasetId2,
  },
  {
    id: "5",
    projectId: "B",
    validFrom: t4,
    validTo: null,
    datasetId: datasetId2,
  },
  {
    id: "6",
    projectId: "B",
    validFrom: t4,
    validTo: null,
    datasetId: datasetId2,
  },
  {
    id: "4",
    projectId: "B",
    validFrom: t1,
    validTo: null,
    datasetId: datasetId2,
  },
  {
    id: "1",
    projectId: "B",
    validFrom: t2,
    validTo: null,
    datasetId: datasetId2,
  },
];

describe("BackfillValidToForDatasetItems", () => {
  beforeAll(async () => {
    // Clean up ALL dataset items to ensure isolated test environment
    await prisma.datasetItem.deleteMany({});

    // Clean up our test projects if they exist
    await prisma.dataset.deleteMany({
      where: { projectId: { in: ["A", "B"] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: ["A", "B"] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: ["org-A", "org-B"] } },
    });

    // Create projects first (foreign key requirement)
    // Create org and projects
    await prisma.organization.createMany({
      data: [
        {
          id: "org-A",
          name: "Org A",
          cloudConfig: {
            plan: "Team",
          },
        },
        {
          id: "org-B",
          name: "Org B",
          cloudConfig: {
            plan: "Team",
          },
        },
      ],
    });
    await prisma.project.createMany({
      data: [
        {
          id: "A",
          name: "Project A",
          orgId: "org-A",
        },
        {
          id: "B",
          name: "Project B",
          orgId: "org-B",
        },
      ],
    });

    // Create datasets
    await prisma.dataset.createMany({
      data: [
        { id: datasetId1, name: "dataset-1", projectId: "A" },
        { id: datasetId2, name: "dataset-2", projectId: "B" },
      ],
    });
  });

  afterEach(async () => {
    // Clean up dataset items after each test for fresh state
    await prisma.datasetItem.deleteMany({
      where: {
        projectId: { in: ["A", "B"] },
      },
    });
  });

  it("should process projects in alphabetical order", async () => {
    await prisma.datasetItem.createMany({
      data: items,
    });

    // First batch: Process 2 items from project A
    const result1 = await backfillValidToForDatasetItems("", "", 2);
    expect(result1.completed).toBe(false);
    expect(result1.lastProcessedProjectId).toBe("A");

    // Second batch: Process remaining item from project A
    const result2 = await backfillValidToForDatasetItems(
      result1.lastProcessedProjectId!,
      result1.lastProcessedId!,
      2,
    );
    expect(result2.lastProcessedProjectId).toBe("A");

    // Third batch: Should move to project B
    const result3 = await backfillValidToForDatasetItems(
      result2.lastProcessedProjectId!,
      result2.lastProcessedId!,
      2,
    );
    expect(result3.lastProcessedProjectId).toBe("B");
  });

  it("should not get stuck on a single project", async () => {
    await prisma.datasetItem.createMany({
      data: items,
    });

    // Process with small batch size to ensure we iterate through project A
    let lastProjectId = "";
    let lastId = "";
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      const result = await backfillValidToForDatasetItems(
        lastProjectId,
        lastId,
        1,
      );

      if (result.completed) break;

      // Track cursor movement
      lastProjectId = result.lastProcessedProjectId!;
      lastId = result.lastProcessedId!;
      iterations++;
    }

    // Should have completed all items without getting stuck
    expect(iterations).toBeLessThan(maxIterations);

    // Verify all items in project A were processed
    const projectAItems = await prisma.datasetItem.findMany({
      where: { projectId: "A", validTo: null },
    });

    // Only current versions should have validTo = null
    const projectAVersionCounts = await prisma.datasetItem.groupBy({
      by: ["id"],
      where: { projectId: "A" },
      _count: true,
    });

    // Current versions: one per unique id
    expect(projectAItems.length).toBe(projectAVersionCounts.length);
  });

  it("should use LEAD() correctly - validate version chain order", async () => {
    // Item with 3 versions at different times
    await prisma.datasetItem.createMany({
      data: items.filter((item) => item.id === "1" && item.projectId === "A"),
    });

    // Run migration
    await backfillValidToForDatasetItems("", "", 100);

    // Verify the chain
    const versions = await prisma.datasetItem.findMany({
      where: { id: "1", projectId: "A" },
      orderBy: { validFrom: "asc" },
    });

    expect(versions.length).toBe(3);

    // v1 (t0) -> v2 (t1): v1.valid_to should equal t1
    expect(versions[0].validTo?.getTime()).toBe(t1.getTime());

    // v2 (t1) -> v3 (t4): v2.valid_to should equal t4
    expect(versions[1].validTo?.getTime()).toBe(t4.getTime());

    // v3 (t4) is current: valid_to should be null
    expect(versions[2].validTo).toBeNull();
  });

  it("should reach correct final state - only current versions have null valid_to", async () => {
    await prisma.datasetItem.createMany({
      data: items,
    });

    // Run migration to completion
    let lastProjectId = "";
    let lastId = "";
    let iterations = 0;

    while (iterations < 20) {
      const result = await backfillValidToForDatasetItems(
        lastProjectId,
        lastId,
        2,
      );

      if (result.completed) break;

      lastProjectId = result.lastProcessedProjectId!;
      lastId = result.lastProcessedId!;
      iterations++;
    }

    // Count unique (projectId, id) pairs
    const uniqueItems = await prisma.datasetItem.groupBy({
      by: ["projectId", "id"],
    });

    // Count rows with valid_to = null (current versions)
    const currentVersions = await prisma.datasetItem.count({
      where: { validTo: null },
    });

    // Should have exactly one current version per unique item
    expect(currentVersions).toBe(uniqueItems.length);

    // Verify no orphaned null valid_to in old versions
    for (const item of uniqueItems) {
      const versions = await prisma.datasetItem.findMany({
        where: { projectId: item.projectId, id: item.id },
        orderBy: { validFrom: "asc" },
      });

      // All but the last version should have valid_to set
      for (let i = 0; i < versions.length - 1; i++) {
        expect(versions[i].validTo).not.toBeNull();
      }

      // Last version should have valid_to = null
      expect(versions[versions.length - 1].validTo).toBeNull();
    }
  });

  it("should handle items with single version correctly", async () => {
    // Items with single version (should not change)
    const singleVersionItems = items.filter(
      (item) =>
        item.projectId === "B" &&
        (item.id === "5" || item.id === "6" || item.id === "1"),
    );

    await prisma.datasetItem.createMany({
      data: singleVersionItems,
    });

    // Run migration
    await backfillValidToForDatasetItems("", "", 100);

    // Verify single-version items remain unchanged (valid_to = null)
    const unchangedItems = await prisma.datasetItem.findMany({
      where: {
        projectId: "B",
        id: { in: ["5", "6", "1"] },
      },
    });

    for (const item of unchangedItems) {
      expect(item.validTo).toBeNull();
    }
  });

  it("should handle mixed state - some versions already have valid_to set by new writes", async () => {
    // Simulate scenario: old data has NULL valid_to, but newer writes have already set valid_to
    const t5 = new Date("2024-01-01T05:00:00Z");
    const t6 = new Date("2024-01-01T06:00:00Z");

    const mixedStateItems = [
      // Item "100": 3 old versions with NULL valid_to (need backfill)
      {
        id: "100",
        projectId: "A",
        validFrom: t0,
        validTo: null, // Should be backfilled to t1
        datasetId: datasetId1,
      },
      {
        id: "100",
        projectId: "A",
        validFrom: t1,
        validTo: null, // Should be backfilled to t2
        datasetId: datasetId1,
      },
      {
        id: "100",
        projectId: "A",
        validFrom: t2,
        validTo: t5, // Already set by new write path
        datasetId: datasetId1,
      },
      {
        id: "100",
        projectId: "A",
        validFrom: t5,
        validTo: null, // Current version - should stay NULL
        datasetId: datasetId1,
      },
      // Item "200": mix of old NULL and already-set valid_to
      {
        id: "200",
        projectId: "A",
        validFrom: t0,
        validTo: null, // Should be backfilled to t3
        datasetId: datasetId1,
      },
      {
        id: "200",
        projectId: "A",
        validFrom: t3,
        validTo: t6, // Already set by new write path
        datasetId: datasetId1,
      },
      {
        id: "200",
        projectId: "A",
        validFrom: t6,
        validTo: null, // Current version - should stay NULL
        datasetId: datasetId1,
      },
    ];

    await prisma.datasetItem.createMany({
      data: mixedStateItems,
    });

    // Run migration
    await backfillValidToForDatasetItems("", "", 100);

    // Verify item "100" chain
    const item100Versions = await prisma.datasetItem.findMany({
      where: { projectId: "A", id: "100" },
      orderBy: { validFrom: "asc" },
    });

    expect(item100Versions).toHaveLength(4);
    expect(item100Versions[0].validTo?.getTime()).toBe(t1.getTime()); // Backfilled
    expect(item100Versions[1].validTo?.getTime()).toBe(t2.getTime()); // Backfilled
    expect(item100Versions[2].validTo?.getTime()).toBe(t5.getTime()); // Already set
    expect(item100Versions[3].validTo).toBeNull(); // Current version

    // Verify item "200" chain
    const item200Versions = await prisma.datasetItem.findMany({
      where: { projectId: "A", id: "200" },
      orderBy: { validFrom: "asc" },
    });

    expect(item200Versions).toHaveLength(3);
    expect(item200Versions[0].validTo?.getTime()).toBe(t3.getTime()); // Backfilled
    expect(item200Versions[1].validTo?.getTime()).toBe(t6.getTime()); // Already set
    expect(item200Versions[2].validTo).toBeNull(); // Current version
  });
});
