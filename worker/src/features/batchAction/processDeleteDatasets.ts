import {
  addToDeleteDatasetQueue,
  deleteDatasetsByIds,
  findDatasetIdsByIds,
} from "@langfuse/shared/src/server";

export async function processDeleteDatasets(
  projectId: string,
  datasetIds: string[],
) {
  const datasetsToDelete = await findDatasetIdsByIds({
    projectId,
    datasetIds,
  });

  if (datasetsToDelete.length === 0) return;

  await deleteDatasetsByIds({
    projectId,
    datasetIds: datasetsToDelete.map((dataset) => dataset.id),
  });

  await Promise.all(
    datasetsToDelete.map((dataset) =>
      addToDeleteDatasetQueue({
        deletionType: "dataset",
        projectId,
        datasetId: dataset.id,
      }),
    ),
  );
}
