import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateDatasetRunItemsForPublicApi } from "@/src/features/public-api/server/dataset-run-items";
import type {
  APIDatasetRunItem,
  GetDatasetsV1Query,
  GetDatasetV1Query,
  GetDatasetItemV1Query,
  GetDatasetItemsV1Query,
  GetDatasetRunV1Query,
  GetDatasetRunsV1Query,
  GetDatasetsV2Query,
  GetDatasetV2Query,
  PostDatasetsV1Body,
  PostDatasetsV2Body,
  PostDatasetItemsV1Body,
} from "@/src/features/public-api/types/datasets";
import {
  transformDbDatasetItemDomainToAPIDatasetItem,
  transformDbDatasetRunToAPIDatasetRun,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import {
  ApiError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  Prisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { upsertDataset } from "./actions/createDataset";
import {
  addToDeleteDatasetQueue,
  createDatasetItemFilterState,
  deleteDatasetItem,
  getDatasetItemById,
  getDatasetItems,
  getDatasetItemsCount,
  logger,
  upsertDatasetItem,
} from "@langfuse/shared/src/server";
import type { z } from "zod";

type DatasetAuditScope = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
};

type ListDatasetsInput = z.infer<typeof GetDatasetsV2Query> & {
  projectId: string;
  name?: string;
};

type ListDatasetsV1Input = z.infer<typeof GetDatasetsV1Query> & {
  projectId: string;
};

type GetDatasetInput = z.infer<typeof GetDatasetV2Query> & {
  projectId: string;
};

type GetDatasetV1Input = z.infer<typeof GetDatasetV1Query> & {
  projectId: string;
};

type CreateDatasetInput = {
  input:
    | z.infer<typeof PostDatasetsV1Body>
    | z.infer<typeof PostDatasetsV2Body>;
  projectId: string;
  auditScope?: DatasetAuditScope;
};

type ListDatasetItemsInput = z.infer<typeof GetDatasetItemsV1Query> & {
  projectId: string;
  datasetId?: string;
};

type GetDatasetItemInput = z.infer<typeof GetDatasetItemV1Query> & {
  projectId: string;
};

type CreateDatasetItemInput = {
  input:
    | z.infer<typeof PostDatasetItemsV1Body>
    | (Omit<z.infer<typeof PostDatasetItemsV1Body>, "datasetName"> & {
        datasetId: string;
      });
  projectId: string;
  auditScope?: DatasetAuditScope;
};

type ListDatasetRunsInput = z.infer<typeof GetDatasetRunsV1Query> & {
  projectId: string;
};

type ListDatasetRunsByDatasetIdInput = {
  projectId: string;
  datasetId: string;
  page: number;
  limit: number;
};

type GetDatasetRunInput = z.infer<typeof GetDatasetRunV1Query> & {
  projectId: string;
};

type GetDatasetRunByIdInput = {
  projectId: string;
  datasetId: string;
  datasetRunId: string;
};

type DeleteDatasetRunInput = DatasetAuditScope &
  z.infer<typeof GetDatasetRunV1Query>;

type DeleteDatasetRunByIdInput = DatasetAuditScope & {
  datasetId: string;
  datasetRunId: string;
};

type DeleteDatasetItemInput = DatasetAuditScope &
  z.infer<typeof GetDatasetItemV1Query>;

const getDatasetByNameOrThrow = async ({
  projectId,
  datasetName,
}: {
  projectId: string;
  datasetName: string;
}) => {
  const dataset = await prisma.dataset.findFirst({
    where: {
      name: datasetName,
      projectId,
    },
  });

  if (!dataset) {
    throw new LangfuseNotFoundError("Dataset not found");
  }

  return dataset;
};

const getDatasetByIdOrThrow = async ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const dataset = await prisma.dataset.findUnique({
    where: {
      id_projectId: {
        id: datasetId,
        projectId,
      },
    },
  });

  if (!dataset) {
    throw new LangfuseNotFoundError("Dataset not found");
  }

  return dataset;
};

const getDatasetRunRecordOrThrow = async ({
  projectId,
  datasetName,
  runName,
  duplicateErrorMessage = "Found more than one dataset run with this name",
}: {
  projectId: string;
  datasetName: string;
  runName: string;
  duplicateErrorMessage?: string;
}) => {
  const datasetRuns = await prisma.datasetRuns.findMany({
    where: {
      projectId,
      name: runName,
      dataset: {
        name: datasetName,
        projectId,
      },
    },
    include: {
      dataset: {
        select: {
          name: true,
        },
      },
    },
  });

  if (datasetRuns.length > 1) {
    throw new ApiError(duplicateErrorMessage);
  }

  if (!datasetRuns[0]) {
    throw new LangfuseNotFoundError("Dataset run not found");
  }

  return datasetRuns[0];
};

export const createDatasetForApi = async ({
  input,
  projectId,
  auditScope,
}: CreateDatasetInput) => {
  const existingDataset = auditScope
    ? await prisma.dataset.findUnique({
        where: {
          projectId_name: {
            projectId,
            name: input.name,
          },
        },
      })
    : null;

  const dataset = await upsertDataset({
    input: {
      name: input.name,
      description: input.description ?? undefined,
      metadata: input.metadata ?? undefined,
      inputSchema: input.inputSchema,
      expectedOutputSchema: input.expectedOutputSchema,
    },
    projectId,
  });

  if (auditScope) {
    await auditLog({
      action: existingDataset ? "update" : "create",
      resourceType: "dataset",
      resourceId: dataset.id,
      projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
      before: existingDataset ?? undefined,
      after: dataset,
    });
  }

  return transformDbDatasetToAPIDataset(dataset);
};

const getDatasetRunRecordByIdOrThrow = async ({
  projectId,
  datasetId,
  datasetRunId,
}: GetDatasetRunByIdInput) => {
  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      id_projectId: {
        id: datasetRunId,
        projectId,
      },
    },
    include: {
      dataset: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!datasetRun || datasetRun.datasetId !== datasetId) {
    throw new LangfuseNotFoundError("Dataset run not found");
  }

  return datasetRun;
};

export const listDatasetsForApi = async ({
  projectId,
  name,
  page,
  limit,
}: ListDatasetsInput) => {
  const where: Prisma.DatasetWhereInput = {
    projectId,
    ...(name ? { name: { contains: name, mode: "insensitive" } } : {}),
  };

  const [datasets, totalItems] = await Promise.all([
    prisma.dataset.findMany({
      select: {
        name: true,
        description: true,
        metadata: true,
        inputSchema: true,
        expectedOutputSchema: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        id: true,
      },
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.dataset.count({ where }),
  ]);

  return {
    data: datasets,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getDatasetForApi = async ({
  projectId,
  datasetName,
}: GetDatasetInput) => {
  const dataset = await getDatasetByNameOrThrow({ projectId, datasetName });
  return transformDbDatasetToAPIDataset(dataset);
};

export const getDatasetByIdForApi = async ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const dataset = await getDatasetByIdOrThrow({ projectId, datasetId });
  return transformDbDatasetToAPIDataset(dataset);
};

export const listDatasetsByProjectForApi = async ({
  projectId,
  page,
  limit,
}: ListDatasetsV1Input) => {
  const datasets = await prisma.dataset.findMany({
    select: {
      name: true,
      description: true,
      metadata: true,
      inputSchema: true,
      expectedOutputSchema: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
      id: true,
      datasetRuns: {
        select: {
          name: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      },
    },
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit,
    skip: (page - 1) * limit,
  });

  const datasetItems = await getDatasetItems({
    projectId,
    filterState: createDatasetItemFilterState({
      datasetIds: datasets.map(({ id }) => id),
      status: "ACTIVE",
    }),
    includeIO: false,
  });

  // create Map of dataset id to dataset item ids
  const datasetItemIdsMap = new Map<string, string[]>();
  for (const item of datasetItems) {
    datasetItemIdsMap.set(item.datasetId, [
      ...(datasetItemIdsMap.get(item.datasetId) || []),
      item.id,
    ]);
  }

  const totalItems = await prisma.dataset.count({
    where: { projectId },
  });

  return {
    data: datasets.map(({ datasetRuns, ...rest }) => ({
      ...rest,
      items: datasetItemIdsMap.get(rest.id) || [],
      runs: datasetRuns.map(({ name }) => name),
    })),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getDatasetByNameForApi = async ({
  projectId,
  name,
}: GetDatasetV1Input) => {
  const dataset = await prisma.dataset.findFirst({
    where: {
      name,
      projectId,
    },
    include: {
      datasetRuns: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!dataset) {
    throw new LangfuseNotFoundError("Dataset not found");
  }

  const datasetItems = await getDatasetItems({
    projectId,
    filterState: createDatasetItemFilterState({
      datasetIds: [dataset.id],
      status: "ACTIVE",
    }),
    includeDatasetName: true,
  });

  const { datasetRuns, ...params } = dataset;

  return {
    ...transformDbDatasetToAPIDataset(params),
    items: datasetItems.map(transformDbDatasetItemDomainToAPIDatasetItem),
    runs: datasetRuns.map((run) => run.name),
  };
};

export const listDatasetItemsForApi = async ({
  projectId,
  datasetId: inputDatasetId,
  datasetName,
  sourceTraceId,
  sourceObservationId,
  version,
  page,
  limit,
}: ListDatasetItemsInput) => {
  let datasetId = inputDatasetId;

  if (datasetId) {
    await getDatasetByIdOrThrow({ projectId, datasetId });
  } else if (datasetName) {
    const dataset = await getDatasetByNameOrThrow({ projectId, datasetName });
    datasetId = dataset.id;
  }

  const filterState = createDatasetItemFilterState({
    ...(datasetId ? { datasetIds: [datasetId] } : {}),
    sourceTraceId: sourceTraceId ?? undefined,
    sourceObservationId: sourceObservationId ?? undefined,
    status: "ACTIVE",
  });

  const [items, totalItems] = await Promise.all([
    getDatasetItems({
      projectId,
      filterState,
      version: version ?? undefined,
      includeDatasetName: true,
      limit,
      page: page - 1,
    }),
    getDatasetItemsCount({
      projectId,
      filterState,
      version: version ?? undefined,
    }),
  ]);

  return {
    data: items.map(transformDbDatasetItemDomainToAPIDatasetItem),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getDatasetItemForApi = async ({
  projectId,
  datasetItemId,
}: GetDatasetItemInput) => {
  const datasetItem = await getDatasetItemById({
    projectId,
    datasetItemId,
  });

  if (!datasetItem) {
    throw new LangfuseNotFoundError("Dataset item not found");
  }

  const dataset = await prisma.dataset.findUnique({
    where: {
      id_projectId: {
        projectId,
        id: datasetItem.datasetId,
      },
    },
    select: { name: true },
  });

  // Note that we cascade items on delete, so returning a 404 here is expected.
  if (!dataset) {
    throw new LangfuseNotFoundError("Dataset not found");
  }

  return transformDbDatasetItemDomainToAPIDatasetItem({
    ...datasetItem,
    status: datasetItem.status ?? "ACTIVE",
    datasetName: dataset.name,
  });
};

export const createDatasetItemForApi = async ({
  input,
  projectId,
  auditScope,
}: CreateDatasetItemInput) => {
  const datasetIdentifierForLog =
    "datasetId" in input ? input.datasetId : input.datasetName;

  try {
    const existingDatasetItem = input.id
      ? await getDatasetItemById({
          projectId,
          datasetItemId: input.id,
        })
      : null;

    const datasetIdentifier =
      "datasetId" in input
        ? { datasetId: input.datasetId }
        : { datasetName: input.datasetName };

    const datasetItem = await upsertDatasetItem({
      projectId,
      ...datasetIdentifier,
      datasetItemId: input.id ?? undefined,
      input: input.input ?? undefined,
      expectedOutput: input.expectedOutput ?? undefined,
      metadata: input.metadata ?? undefined,
      sourceTraceId: input.sourceTraceId ?? undefined,
      sourceObservationId: input.sourceObservationId ?? undefined,
      status: input.status ?? undefined,
      normalizeOpts: { sanitizeControlChars: true },
      validateOpts: { normalizeUndefinedToNull: !!input.id ? false : true },
    });

    if (auditScope) {
      await auditLog({
        action: existingDatasetItem ? "update" : "create",
        resourceType: "datasetItem",
        resourceId: datasetItem.id,
        projectId,
        orgId: auditScope.orgId,
        apiKeyId: auditScope.apiKeyId,
        before: existingDatasetItem ?? undefined,
        after: datasetItem,
      });
    }

    return transformDbDatasetItemDomainToAPIDatasetItem({
      ...datasetItem,
      datasetName: datasetItem.datasetName,
      status: datasetItem.status ?? "ACTIVE",
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        // this case happens when a dataset item was created for a different dataset.
        // In the database, the uniqueness constraint is on (id, projectId) only.
        // When this constraint is violated, the database will upsert based on (id, projectId, datasetId).
        // If this record does not exist, the database will throw an error.
        logger.warn(
          `Failed to upsert dataset item. Dataset item ${input.id} already exists for a different dataset than ${datasetIdentifierForLog}`,
        );
        throw new LangfuseNotFoundError(
          `The dataset item with id ${input.id} already exists in a dataset other than ${datasetIdentifierForLog}`,
        );
      }

      if (error.code === "P2002") {
        // Unique constraint violation on (id, projectId, validFrom).
        // This can happen when concurrent requests try to update the same dataset item
        // and create versions with the same timestamp.
        logger.warn(
          `Failed to upsert dataset item due to version conflict. Dataset item ${input.id} was modified concurrently.`,
        );
        throw new LangfuseConflictError(
          `Dataset item ${input.id ?? "new"} was modified concurrently. Please retry the request.`,
        );
      }
    }

    throw error;
  }
};

export const deleteDatasetItemForApi = async ({
  projectId,
  orgId,
  apiKeyId,
  datasetItemId,
}: DeleteDatasetItemInput) => {
  const result = await deleteDatasetItem({
    projectId,
    datasetItemId,
  });

  await auditLog({
    action: "delete",
    resourceType: "datasetItem",
    resourceId: datasetItemId,
    projectId,
    orgId,
    apiKeyId,
    before: result.deletedItem,
  });

  return {
    message: "Dataset item successfully deleted" as const,
  };
};

export const listDatasetRunsForApi = async ({
  projectId,
  name,
  page,
  limit,
}: ListDatasetRunsInput) => {
  const dataset = await prisma.dataset.findFirst({
    where: {
      name,
      projectId,
    },
    include: {
      datasetRuns: {
        where: { projectId },
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      },
    },
  });

  if (!dataset) {
    throw new LangfuseNotFoundError("Dataset not found");
  }

  const totalItems = await prisma.datasetRuns.count({
    where: {
      datasetId: dataset.id,
      projectId,
    },
  });

  return {
    data: dataset.datasetRuns
      .map((run) => ({ ...run, datasetName: dataset.name }))
      .map(transformDbDatasetRunToAPIDatasetRun),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const listDatasetRunsByDatasetIdForApi = async ({
  projectId,
  datasetId,
  page,
  limit,
}: ListDatasetRunsByDatasetIdInput) => {
  const dataset = await getDatasetByIdOrThrow({ projectId, datasetId });

  const [datasetRuns, totalItems] = await Promise.all([
    prisma.datasetRuns.findMany({
      where: {
        datasetId,
        projectId,
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    prisma.datasetRuns.count({
      where: {
        datasetId,
        projectId,
      },
    }),
  ]);

  return {
    data: datasetRuns
      .map((run) => ({ ...run, datasetName: dataset.name }))
      .map(transformDbDatasetRunToAPIDatasetRun),
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getDatasetRunForApi = async ({
  projectId,
  name,
  runName,
}: GetDatasetRunInput) => {
  const { dataset, ...run } = await getDatasetRunRecordOrThrow({
    projectId,
    datasetName: name,
    runName,
  });

  const datasetRunItems = (await generateDatasetRunItemsForPublicApi({
    props: {
      datasetId: run.datasetId,
      runId: run.id,
      projectId,
    },
  })) as APIDatasetRunItem[];

  return {
    ...transformDbDatasetRunToAPIDatasetRun({
      ...run,
      datasetName: dataset.name,
    }),
    datasetRunItems,
  };
};

export const getDatasetRunByIdForApi = async ({
  projectId,
  datasetId,
  datasetRunId,
}: GetDatasetRunByIdInput) => {
  const { dataset, ...run } = await getDatasetRunRecordByIdOrThrow({
    projectId,
    datasetId,
    datasetRunId,
  });

  const datasetRunItems = (await generateDatasetRunItemsForPublicApi({
    props: {
      datasetId: run.datasetId,
      runId: run.id,
      projectId,
    },
  })) as APIDatasetRunItem[];

  return {
    ...transformDbDatasetRunToAPIDatasetRun({
      ...run,
      datasetName: dataset.name,
    }),
    datasetRunItems,
  };
};

export const deleteDatasetRunForApi = async ({
  projectId,
  orgId,
  apiKeyId,
  name,
  runName,
}: DeleteDatasetRunInput) => {
  // First get the dataset run to check if it exists
  const { dataset: _dataset, ...datasetRun } = await getDatasetRunRecordOrThrow(
    {
      projectId,
      datasetName: name,
      runName,
      duplicateErrorMessage:
        "Found more than one dataset run with this name and dataset",
    },
  );

  await prisma.datasetRuns.delete({
    where: {
      id_projectId: {
        projectId,
        id: datasetRun.id,
      },
    },
  });

  await auditLog({
    action: "delete",
    resourceType: "datasetRun",
    resourceId: datasetRun.id,
    projectId,
    orgId,
    apiKeyId,
    before: datasetRun,
  });

  // Trigger async delete of dataset run items
  await addToDeleteDatasetQueue({
    deletionType: "dataset-runs",
    projectId,
    datasetRunIds: [datasetRun.id],
    datasetId: datasetRun.datasetId,
  });

  return {
    message: "Dataset run successfully deleted" as const,
  };
};

export const deleteDatasetRunByIdForApi = async ({
  projectId,
  orgId,
  apiKeyId,
  datasetId,
  datasetRunId,
}: DeleteDatasetRunByIdInput) => {
  const { dataset: _dataset, ...datasetRun } =
    await getDatasetRunRecordByIdOrThrow({
      projectId,
      datasetId,
      datasetRunId,
    });

  await prisma.datasetRuns.delete({
    where: {
      id_projectId: {
        projectId,
        id: datasetRun.id,
      },
    },
  });

  await auditLog({
    action: "delete",
    resourceType: "datasetRun",
    resourceId: datasetRun.id,
    projectId,
    orgId,
    apiKeyId,
    before: datasetRun,
  });

  await addToDeleteDatasetQueue({
    deletionType: "dataset-runs",
    projectId,
    datasetRunIds: [datasetRun.id],
    datasetId: datasetRun.datasetId,
  });

  return {
    message: "Dataset run successfully deleted" as const,
  };
};
