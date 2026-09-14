import { expect, describe, it } from "vitest";
import {
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createOrgProjectAndApiKey,
  getDatasetRunItemsByDatasetIdCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { processClickhouseDatasetDelete } from "../features/datasets/processClickhouseDatasetDelete";

const getRunItems = (projectId: string, datasetId: string) =>
  getDatasetRunItemsByDatasetIdCh({
    projectId,
    datasetId,
    filter: [],
    limit: 100,
  });

describe("dataset deletion", () => {
  it("should delete only the targeted runs' items for deletionType dataset-runs", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();

    const datasetId = randomUUID();
    const targetRunId = randomUUID();
    const otherRunId = randomUUID();

    await createDatasetRunItemsCh([
      createDatasetRunItem({
        project_id: projectId,
        dataset_id: datasetId,
        dataset_run_id: targetRunId,
      }),
      createDatasetRunItem({
        project_id: projectId,
        dataset_id: datasetId,
        dataset_run_id: targetRunId,
      }),
      createDatasetRunItem({
        project_id: projectId,
        dataset_id: datasetId,
        dataset_run_id: otherRunId,
      }),
      // same dataset and run ids in another project must survive the delete
      createDatasetRunItem({
        project_id: otherProjectId,
        dataset_id: datasetId,
        dataset_run_id: targetRunId,
      }),
    ]);

    await processClickhouseDatasetDelete({
      deletionType: "dataset-runs",
      projectId,
      datasetId,
      datasetRunIds: [targetRunId],
    });

    const remaining = await getRunItems(projectId, datasetId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].datasetRunId).toBe(otherRunId);

    await expect(getRunItems(otherProjectId, datasetId)).resolves.toHaveLength(
      1,
    );
  });

  it("should delete all run items and media links for deletionType dataset", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const datasetId = randomUUID();
    const otherDatasetId = randomUUID();

    await createDatasetRunItemsCh([
      createDatasetRunItem({ project_id: projectId, dataset_id: datasetId }),
      createDatasetRunItem({ project_id: projectId, dataset_id: datasetId }),
      createDatasetRunItem({
        project_id: projectId,
        dataset_id: otherDatasetId,
      }),
    ]);

    // dataset_item_media rows have no FK cascading on dataset deletion; the
    // delete processor is the only path that removes them.
    const mediaId = randomUUID();
    await prisma.datasetItemMedia.createMany({
      data: [
        {
          id: randomUUID(),
          projectId,
          datasetId,
          datasetItemId: randomUUID(),
          mediaId,
          field: "input",
        },
        {
          id: randomUUID(),
          projectId,
          datasetId: otherDatasetId,
          datasetItemId: randomUUID(),
          mediaId,
          field: "input",
        },
      ],
    });

    await processClickhouseDatasetDelete({
      deletionType: "dataset",
      projectId,
      datasetId,
    });

    await expect(getRunItems(projectId, datasetId)).resolves.toHaveLength(0);
    await expect(getRunItems(projectId, otherDatasetId)).resolves.toHaveLength(
      1,
    );

    await expect(
      prisma.datasetItemMedia.findMany({ where: { projectId, datasetId } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.datasetItemMedia.findMany({
        where: { projectId, datasetId: otherDatasetId },
      }),
    ).resolves.toHaveLength(1);
  });
});
