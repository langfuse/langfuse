import {
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createManyDatasetItems,
  createOrgProjectAndApiKey,
  getDatasetRunItemsCountCh,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { type FilterState } from "@langfuse/shared";

process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

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

    await createManyDatasetItems({
      projectId,
      items: datasetIds.map((datasetId, index) => ({
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

    await createDatasetRunItemsCh(
      datasetItemIds.map((datasetItemId, index) =>
        createDatasetRunItem({
          dataset_item_id: datasetItemId,
          dataset_run_id: datasetRunIds[index],
          trace_id: uuidv4(),
          project_id: projectId,
          dataset_id: datasetIds[index],
        }),
      ),
    );
  });
  describe("GET datasetItems.countAll", () => {
    it("should GET all dataset run items with no filter", async () => {
      const count = await getDatasetRunItemsCountCh({
        projectId: projectId,
        filter: [],
      });

      expect(count).toBe(2);
    });

    it("should GET all dataset run items with filter", async () => {
      const count = await getDatasetRunItemsCountCh({
        projectId: projectId,
        filter: generateFilter([datasetIds[0]]),
      });

      expect(count).toBe(1);
    });
  });
});
