vi.hoisted(() => {
  process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
    "false";
  process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION =
    "false";
});

import { LangfuseConflictError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { upsertDatasetItem } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const createDataset = async () => {
  const datasetId = v4();
  await prisma.dataset.create({
    data: { id: datasetId, name: v4(), projectId },
  });
  return datasetId;
};

describe("Dataset item stateful upsert", () => {
  it("throws a conflict when item id exists in another dataset of the project", async () => {
    const datasetAId = await createDataset();
    const datasetBId = await createDataset();
    const itemId = v4();

    await upsertDatasetItem({
      projectId,
      datasetId: datasetAId,
      datasetItemId: itemId,
      input: { key: "value" },
      normalizeOpts: {},
      validateOpts: {},
    });

    const upsertIntoOtherDataset = upsertDatasetItem({
      projectId,
      datasetId: datasetBId,
      datasetItemId: itemId,
      input: { key: "other" },
      normalizeOpts: {},
      validateOpts: {},
    });

    await expect(upsertIntoOtherDataset).rejects.toThrow(LangfuseConflictError);
    await expect(upsertIntoOtherDataset).rejects.toThrow(
      `Dataset item id ${itemId} already exists in another dataset (id ${datasetAId}) in this project; item ids are unique per project across datasets. Use a different id or target dataset ${datasetAId}.`,
    );
  });
});
