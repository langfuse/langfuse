import { v4 } from "uuid";
import type { NextApiResponse } from "next";
import type { z } from "zod";

import { addDatasetRunItemsToEvalQueue } from "@/src/features/evals/server/addDatasetRunItemsToEvalQueue";
import { createOrFetchDatasetRun } from "@/src/features/public-api/server/dataset-runs";
import {
  generateDatasetRunItemsForPublicApi,
  getDatasetRunItemsCountForPublicApi,
} from "@/src/features/public-api/server/dataset-run-items";
import {
  type APIDatasetRunItem,
  PostDatasetRunItemsV1Response,
  type PostDatasetRunItemsV1Body,
} from "@/src/features/public-api/types/datasets";
import {
  type JSONValue,
  LangfuseNotFoundError,
  UnauthorizedError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  eventTypes,
  getDatasetItemById,
  getObservationById,
  logger,
  processEventBatch,
  type AuthHeaderValidVerificationResultIngestion,
} from "@langfuse/shared/src/server";

const resolveMetadata = (metadata: JSONValue): Record<string, unknown> => {
  if (Array.isArray(metadata)) {
    return { metadata };
  }
  if (typeof metadata === "object" && metadata !== null) {
    return metadata as Record<string, unknown>;
  }
  return { metadata };
};

export const createDatasetRunItemForApi = async ({
  body,
  auth,
  res,
}: {
  body: z.infer<typeof PostDatasetRunItemsV1Body>;
  auth: AuthHeaderValidVerificationResultIngestion;
  res?: NextApiResponse;
}) => {
  /**************
   * VALIDATION *
   **************/
  const { traceId, observationId, datasetItemId } = body;
  const projectId = auth.scope.projectId;

  if (!projectId) {
    throw new UnauthorizedError(
      "Missing projectId in scope. Are you using an organization key?",
    );
  }

  const datasetItem = await getDatasetItemById({
    projectId,
    datasetItemId,
    status: "ACTIVE",
    version: body.datasetVersion ?? undefined,
  });

  if (!datasetItem) {
    throw new LangfuseNotFoundError("Dataset item not found");
  }

  let finalTraceId = traceId;

  // Backwards compatibility: historically, dataset run items were linked to observations, not traces
  if (!traceId && observationId) {
    const observation = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: false,
    });
    if (!observation) {
      throw new LangfuseNotFoundError("Observation not found");
    }
    finalTraceId = observation.traceId;
  }

  if (!finalTraceId) {
    throw new LangfuseNotFoundError("Trace not found");
  }

  /****************
   * RUN CREATION *
   ****************/
  const metadata = {
    ...(body.metadata ? resolveMetadata(body.metadata) : {}),
    ...(body.datasetVersion
      ? { dataset_version: body.datasetVersion.toISOString() }
      : {}),
  };
  const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();

  const run = await createOrFetchDatasetRun({
    name: body.runName,
    description: body.runDescription ?? undefined,
    metadata,
    projectId,
    datasetId: datasetItem.datasetId,
    createdAt,
  });

  const runItemId = v4();

  /*********************
   * RUN ITEM CREATION *
   *********************/
  const event = {
    id: runItemId,
    type: eventTypes.DATASET_RUN_ITEM_CREATE,
    timestamp: new Date().toISOString(),
    body: {
      id: runItemId,
      traceId: finalTraceId,
      observationId: observationId ?? undefined,
      error: null,
      createdAt: createdAt.toISOString(),
      datasetId: datasetItem.datasetId,
      runId: run.id,
      datasetItemId: datasetItem.id,
      datasetVersion: datasetItem.validFrom.toISOString(),
    },
  };

  // note: currently we do not accept user defined ids for dataset run items
  const ingestionResult = await processEventBatch([event], auth, {
    isLangfuseInternal: true,
  });

  if (ingestionResult.errors.length > 0) {
    const error = ingestionResult.errors[0];
    if (res) {
      res.status(error.status).json({ message: error.error ?? error.message });
      // We will still return the mock dataset run item in the response for now. Logs are to be monitored.
    } else {
      throw new Error(error.error ?? error.message);
    }
  }

  if (ingestionResult.successes.length !== 1) {
    logger.error("Failed to create dataset run item", {
      result: ingestionResult,
    });
    throw new Error("Failed to create dataset run item");
  }

  /***********************
   * ASYNC RUN ITEM EVAL *
   ***********************/
  await addDatasetRunItemsToEvalQueue({
    projectId,
    datasetItemId: datasetItem.id,
    datasetItemValidFrom: datasetItem.validFrom,
    traceId: finalTraceId,
    observationId: observationId ?? undefined,
  });

  const datasetRunItem: APIDatasetRunItem = {
    id: event.body.id,
    datasetRunId: run.id,
    datasetRunName: run.name,
    datasetItemId: datasetItem.id,
    traceId: finalTraceId,
    observationId: observationId ?? null,
    createdAt,
    updatedAt: createdAt,
  };

  return PostDatasetRunItemsV1Response.parse(datasetRunItem);
};

export const listDatasetRunItemsForApi = async ({
  datasetId,
  runName,
  projectId,
  limit,
  page,
}: {
  datasetId: string;
  runName: string;
  projectId: string;
  limit: number;
  page: number;
}) => {
  /**************
   * VALIDATION *
   **************/
  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      datasetId_projectId_name: {
        datasetId,
        name: runName,
        projectId,
      },
    },
    select: { id: true, name: true },
  });

  if (!datasetRun) {
    throw new LangfuseNotFoundError(
      "Dataset run not found for the given project and dataset id",
    );
  }

  /************
   * RESPONSE *
   ************/
  const [items, count] = await Promise.all([
    generateDatasetRunItemsForPublicApi({
      props: {
        datasetId,
        runId: datasetRun.id,
        projectId,
        limit,
        page,
      },
    }),
    getDatasetRunItemsCountForPublicApi({
      props: {
        datasetId,
        runId: datasetRun.id,
        projectId,
        limit,
        page,
      },
    }),
  ]);

  const totalItems = count || 0;

  return {
    data: items,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const listDatasetRunItemsByRunIdForApi = async ({
  datasetId,
  datasetRunId,
  projectId,
  limit,
  page,
}: {
  datasetId: string;
  datasetRunId: string;
  projectId: string;
  limit: number;
  page: number;
}) => {
  /**************
   * VALIDATION *
   **************/
  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      id_projectId: {
        id: datasetRunId,
        projectId,
      },
    },
    select: { id: true, datasetId: true },
  });

  if (!datasetRun || datasetRun.datasetId !== datasetId) {
    throw new LangfuseNotFoundError(
      "Dataset run not found for the given project and dataset id",
    );
  }

  /************
   * RESPONSE *
   ************/
  const [items, count] = await Promise.all([
    generateDatasetRunItemsForPublicApi({
      props: {
        datasetId,
        runId: datasetRun.id,
        projectId,
        limit,
        page,
      },
    }),
    getDatasetRunItemsCountForPublicApi({
      props: {
        datasetId,
        runId: datasetRun.id,
        projectId,
        limit,
        page,
      },
    }),
  ]);

  const totalItems = count || 0;

  return {
    data: items,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};
