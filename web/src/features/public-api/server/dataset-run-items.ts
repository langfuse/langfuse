import {
  type PostDatasetRunItemsV1Body,
  transformDbDatasetRunItemToAPIDatasetRunItemCh,
} from "@/src/features/public-api/types/datasets";
import { prisma } from "@langfuse/shared/src/db";
import {
  getDatasetRunItemsTableCh,
  getObservationById,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import type z from "zod/v4";
import type { Prisma } from "@prisma/client";

// Use Prisma's default inferred type for dataset items (no field redefinition needed)
type DatasetItem = Prisma.DatasetItemGetPayload<{}>;

type DatasetRunItemsQueryType = {
  projectId: string;
  datasetId: string;
  runName: string;
  page?: number;
  limit?: number;
};

export const generateDatasetRunItemsForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runName, limit, page } = props;

  const result = await getDatasetRunItemsTableCh({
    projectId,
    filter: [
      {
        column: "dataset_id",
        operator: "=",
        value: datasetId,
        type: "string" as const,
      },
      {
        column: "dataset_run_name",
        operator: "any of",
        value: [runName],
        type: "arrayOptions" as const,
      },
    ],
    orderBy: {
      column: "created_at",
      order: "DESC",
    },
    limit: limit,
    offset: page && limit ? page * limit : undefined,
  });

  return result.map(transformDbDatasetRunItemToAPIDatasetRunItemCh);
};

export const getDatasetRunItemsCountForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runName } = props;

  const query = `
    SELECT count() as count
    FROM dataset_run_items dri
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_name = {runName: String}
  `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { projectId: projectId, datasetId: datasetId, runName: runName },
  });
  return records.map((record) => Number(record.count)).shift();
};

type ValidateDatasetItemAndFetchReturn =
  | {
      success: true;
      datasetItem: DatasetItem;
      traceId: string;
      observationId: string | null;
    }
  | {
      success: false;
      error: string;
    };

export const validateCreateDatasetRunItemBodyAndFetch = async (
  body: z.infer<typeof PostDatasetRunItemsV1Body>,
  projectId: string,
): Promise<ValidateDatasetItemAndFetchReturn> => {
  const { datasetItemId, observationId, traceId } = body;

  const datasetItem = await prisma.datasetItem.findUnique({
    where: {
      id_projectId: {
        projectId,
        id: datasetItemId,
      },
      status: "ACTIVE",
    },
  });

  if (!datasetItem) {
    return { success: false, error: "Dataset item not found or not active" };
  }

  let finalTraceId = traceId;

  // Backwards compatibility: historically, dataset run items were linked to observations, not traces
  if (!traceId && observationId) {
    const observation = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: true,
    });
    if (observationId && !observation) {
      return { success: false, error: "Observation not found" };
    }
    finalTraceId = observation?.traceId;
  }

  if (!finalTraceId) {
    return { success: false, error: "Trace not found" };
  }

  return {
    success: true,
    datasetItem,
    traceId: finalTraceId,
    observationId: observationId ?? null,
  };
};
