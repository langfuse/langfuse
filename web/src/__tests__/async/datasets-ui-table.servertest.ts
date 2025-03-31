import {
  createOrgProjectAndApiKey,
  getDatasetRunItemsTableCount,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { type FilterState } from "@langfuse/shared";

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
});
