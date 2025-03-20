import {
  createOrgProjectAndApiKey,
  getDatasetItemsTableCount,
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
      data: datasetIds.map((datasetId) => ({
        id: uuidv4(),
        projectId: projectId,
        datasetId: datasetId,
      })),
    });
  });
  describe("GET datasetItems.countAll", () => {
    it("should GET all dataset items", async () => {
      const { totalCount } = await getDatasetItemsTableCount({
        projectId: projectId,
        filter: [],
      });

      expect(totalCount).toBe(2);
    });
  });

  describe("GET datasetItems.countAll", () => {
    it("should GET all dataset items with filter", async () => {
      const { totalCount } = await getDatasetItemsTableCount({
        projectId: projectId,
        filter: generateFilter([datasetIds[0]]),
      });

      expect(totalCount).toBe(1);
    });
  });
});
