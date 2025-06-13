import {
  createOrgProjectAndApiKey,
  getDatasetRunItemsTableCount,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { type FilterState } from "@langfuse/shared";
import { DatasetStatus } from "@langfuse/shared";
import { fetchDatasetItems } from "@/src/features/datasets/server/service";

const generateFilter = (datasetIds: string[]): FilterState => {
  return [
    {
      column: "Dataset",
      operator: "any of",
      type: "stringOptions",
      value: datasetIds,
    },
  ];
};

describe("trpc.datasets", () => {
  let projectId: string;
  let datasetIds: string[];

  beforeAll(async () => {
    const { projectId: newProjectId } = await createOrgProjectAndApiKey();
    const datasetItemIds = [uuidv4(), uuidv4()];
    const datasetRunIds = [uuidv4(), uuidv4()];
    projectId = newProjectId;
    datasetIds = [uuidv4(), uuidv4()];

    await prisma.dataset.createMany({
      data: datasetIds.map((datasetId, index) => ({
        id: datasetId,
        projectId: projectId,
        name: `test-${index}`,
      })),
    });

    await prisma.datasetItem.createMany({
      data: datasetIds.map((datasetId, index) => ({
        id: datasetItemIds[index],
        projectId: projectId,
        datasetId: datasetId,
      })),
    });

    await prisma.datasetRuns.createMany({
      data: datasetRunIds.map((datasetRunId, index) => ({
        id: datasetRunId,
        projectId: projectId,
        datasetId: datasetIds[index],
        name: `test-${index}`,
      })),
    });

    await prisma.datasetRunItems.createMany({
      data: datasetItemIds.map((datasetItemId, index) => ({
        id: uuidv4(),
        projectId: projectId,
        datasetItemId: datasetItemId,
        traceId: uuidv4(),
        datasetRunId: datasetRunIds[index],
      })),
    });
  });
  describe("GET datasetItems.countAll", () => {
    it("should GET all dataset run items with no filter", async () => {
      const { totalCount } = await getDatasetRunItemsTableCount({
        projectId: projectId,
        filter: [],
      });

      expect(totalCount).toBe(2);
    });

    it("should GET all dataset run items with filter", async () => {
      const { totalCount } = await getDatasetRunItemsTableCount({
        projectId: projectId,
        filter: generateFilter([datasetIds[0]]),
      });

      expect(totalCount).toBe(1);
    });
  });

  describe("Dataset Items Filter Tests", () => {
    let testDatasetId: string;
    let testDatasetItems: string[];

    beforeAll(async () => {
      // Create a separate dataset for filtering tests
      testDatasetId = uuidv4();
      await prisma.dataset.create({
        data: {
          id: testDatasetId,
          projectId: projectId,
          name: "filter-test-dataset",
        },
      });

      // Create test dataset items with different statuses and content
      testDatasetItems = [uuidv4(), uuidv4(), uuidv4()];

      await prisma.datasetItem.createMany({
        data: [
          {
            id: testDatasetItems[0],
            projectId: projectId,
            datasetId: testDatasetId,
            status: DatasetStatus.ACTIVE,
            input: { query: "test cats" },
            expectedOutput: { response: "cat info" },
            metadata: { category: "animals" },
          },
          {
            id: testDatasetItems[1],
            projectId: projectId,
            datasetId: testDatasetId,
            status: DatasetStatus.ARCHIVED,
            input: { query: "test dogs" },
            expectedOutput: { response: "dog info" },
            metadata: { category: "animals" },
          },
          {
            id: testDatasetItems[2],
            projectId: projectId,
            datasetId: testDatasetId,
            status: DatasetStatus.ACTIVE,
            input: { text: "hello world" },
            expectedOutput: { response: "greeting" },
            metadata: { category: "greetings" },
          },
        ],
      });
    });

    type DatasetItemFilterTestCase = {
      description: string;
      filterState: FilterState;
      expectedCount: number;
      expectedItemIds?: () => string[];
    };

    const getFilterTestCases = (): DatasetItemFilterTestCase[] => [
      {
        description: "filter by ACTIVE status",
        filterState: [
          {
            column: "status",
            operator: "any of",
            type: "stringOptions",
            value: ["ACTIVE"],
          },
        ],
        expectedCount: 2,
        expectedItemIds: () => [testDatasetItems[0], testDatasetItems[2]],
      },
      {
        description: "filter by ARCHIVED status",
        filterState: [
          {
            column: "status",
            operator: "any of",
            type: "stringOptions",
            value: ["ARCHIVED"],
          },
        ],
        expectedCount: 1,
        expectedItemIds: () => [testDatasetItems[1]],
      },
      {
        description: "filter by ID exact match",
        filterState: [
          {
            column: "id",
            operator: "=",
            type: "string",
            value: "",
          },
        ],
        expectedCount: 1,
        expectedItemIds: () => [testDatasetItems[0]],
      },
      {
        description: "filter by ID contains",
        filterState: [
          {
            column: "id",
            operator: "contains",
            type: "string",
            value: "",
          },
        ],
        expectedCount: 1,
        expectedItemIds: () => [testDatasetItems[0]],
      },
      {
        description: "filter by input JSON content",
        filterState: [
          {
            column: "input",
            operator: "contains",
            type: "stringObject",
            value: "cats",
            key: "",
          },
        ],
        expectedCount: 1,
        expectedItemIds: () => [testDatasetItems[0]],
      },
      {
        description: "filter by expectedOutput JSON content",
        filterState: [
          {
            column: "expectedOutput",
            operator: "contains",
            type: "stringObject",
            value: "dog info",
            key: "",
          },
        ],
        expectedCount: 1,
        expectedItemIds: () => [testDatasetItems[1]],
      },
      {
        description: "filter by metadata JSON content",
        filterState: [
          {
            column: "metadata",
            operator: "contains",
            type: "stringObject",
            value: "animals",
            key: "",
          },
        ],
        expectedCount: 2,
        expectedItemIds: () => [testDatasetItems[0], testDatasetItems[1]],
      },
      {
        description: "multiple filters - ACTIVE status AND cats content",
        filterState: [
          {
            column: "status",
            operator: "any of",
            type: "stringOptions",
            value: ["ACTIVE"],
          },
          {
            column: "input",
            operator: "contains",
            type: "stringObject",
            value: "cats",
            key: "",
          },
        ],
        expectedCount: 1,
        expectedItemIds: () => [testDatasetItems[0]],
      },
      {
        description: "no matches - non-existent content",
        filterState: [
          {
            column: "input",
            operator: "contains",
            type: "stringObject",
            value: "non-existent-content",
            key: "",
          },
        ],
        expectedCount: 0,
        expectedItemIds: () => [],
      },
    ];

    getFilterTestCases().forEach((testCase: DatasetItemFilterTestCase) => {
      it(`should ${testCase.description}`, async () => {
        // Update filter with actual values for dynamic tests
        let filterState = testCase.filterState;
        if (testCase.description === "filter by ID exact match") {
          filterState = [
            {
              column: "id",
              operator: "=",
              type: "string",
              value: testDatasetItems[0],
            },
          ];
        } else if (testCase.description === "filter by ID contains") {
          filterState = [
            {
              column: "id",
              operator: "contains",
              type: "string",
              value: testDatasetItems[0].substring(0, 8),
            },
          ];
        }

        const result = await fetchDatasetItems({
          projectId: projectId,
          datasetId: testDatasetId,
          limit: 10,
          page: 0,
          prisma: prisma,
          filter: filterState,
        });

        expect(result.totalDatasetItems).toBe(testCase.expectedCount);
        expect(result.datasetItems).toHaveLength(testCase.expectedCount);

        if (testCase.expectedItemIds && testCase.expectedItemIds().length > 0) {
          const resultIds = result.datasetItems.map((item) => item.id);
          testCase.expectedItemIds().forEach((expectedId: string) => {
            expect(resultIds).toContain(expectedId);
          });
        }
      });
    });

    it("should handle empty filter array", async () => {
      const result = await fetchDatasetItems({
        projectId: projectId,
        datasetId: testDatasetId,
        limit: 10,
        page: 0,
        prisma: prisma,
        filter: [],
      });

      expect(result.totalDatasetItems).toBe(3);
      expect(result.datasetItems).toHaveLength(3);
    });

    it("should handle pagination with filters", async () => {
      // Test first page
      const page1 = await fetchDatasetItems({
        projectId: projectId,
        datasetId: testDatasetId,
        limit: 2,
        page: 0,
        prisma: prisma,
        filter: [
          {
            column: "status",
            operator: "any of",
            type: "stringOptions",
            value: ["ACTIVE"],
          },
        ],
      });

      expect(page1.totalDatasetItems).toBe(2);
      expect(page1.datasetItems).toHaveLength(2);

      // Test second page
      const page2 = await fetchDatasetItems({
        projectId: projectId,
        datasetId: testDatasetId,
        limit: 2,
        page: 1,
        prisma: prisma,
        filter: [
          {
            column: "status",
            operator: "any of",
            type: "stringOptions",
            value: ["ACTIVE"],
          },
        ],
      });

      expect(page2.totalDatasetItems).toBe(2);
      expect(page2.datasetItems).toHaveLength(0); // No more items on page 2
    });

    it("should handle graceful fallback when filter fails", async () => {
      const result = await fetchDatasetItems({
        projectId: projectId,
        datasetId: testDatasetId,
        limit: 10,
        page: 0,
        prisma: prisma,
        filter: [
          {
            // @ts-ignore - Testing invalid column for graceful fallback
            column: "nonExistentColumn",
            operator: "=",
            type: "string",
            value: "test",
          },
        ],
      });

      // Should fall back to returning all items when filter fails
      expect(result.datasetItems.length).toBeGreaterThan(0);
    });
  });
});
