import { v4 } from "uuid";
import {
  ApiError,
  type JSONValue,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  addToDeleteDatasetQueue,
  createDatasetItemFilterState,
  deleteDatasetItem,
  eventTypes,
  getDatasetItemById,
  getDatasetItems,
  getDatasetItemsCount,
  getObservationById,
  logger,
  processEventBatch,
  upsertDatasetItem,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { addDatasetRunItemsToEvalQueue } from "@/src/features/evals/server/addDatasetRunItemsToEvalQueue";
import { createOrFetchDatasetRun } from "@/src/features/public-api/server/dataset-runs";
import {
  generateDatasetRunItemsForPublicApi,
  getDatasetRunItemsCountForPublicApi,
} from "@/src/features/public-api/server/dataset-run-items";
import { upsertDataset } from "@/src/features/datasets/server/actions/createDataset";
import {
  DeleteDatasetItemV1Query,
  DeleteDatasetItemV1Response,
  DeleteDatasetRunV1Query,
  DeleteDatasetRunV1Response,
  GetDatasetItemV1Query,
  GetDatasetItemV1Response,
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  GetDatasetRunItemsV1Query,
  GetDatasetRunItemsV1Response,
  GetDatasetRunV1Query,
  GetDatasetRunV1Response,
  GetDatasetRunsV1Query,
  GetDatasetRunsV1Response,
  GetDatasetV2Query,
  GetDatasetV2Response,
  GetDatasetsV2Query,
  GetDatasetsV2Response,
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
  PostDatasetsV2Body,
  PostDatasetsV2Response,
  type APIDatasetRunItem,
  transformDbDatasetItemDomainToAPIDatasetItem,
  transformDbDatasetRunToAPIDatasetRun,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../core/define-tool";
import {
  getMcpPublicApiAuth,
  paginationMeta,
  runPublicApiTool,
} from "../publicApi";

const resolveMetadata = (metadata: JSONValue): Record<string, unknown> => {
  if (Array.isArray(metadata)) {
    return { metadata };
  }
  if (typeof metadata === "object" && metadata !== null) {
    return metadata as Record<string, unknown>;
  }
  return { metadata };
};

export const [createDatasetTool, handleCreateDataset] = defineTool({
  name: "createDataset",
  description: "Create or update a v2 dataset in the current Langfuse project.",
  baseSchema: PostDatasetsV2Body,
  inputSchema: PostDatasetsV2Body,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.datasets.create",
      context,
      attributes: { "mcp.dataset_name": input.name },
      fn: async () => {
        const dataset = await upsertDataset({
          input: {
            name: input.name,
            description: input.description ?? undefined,
            metadata: input.metadata ?? undefined,
            inputSchema: input.inputSchema,
            expectedOutputSchema: input.expectedOutputSchema,
          },
          projectId: context.projectId,
        });

        await auditLog({
          action: "create",
          resourceType: "dataset",
          resourceId: dataset.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: dataset,
        });

        return PostDatasetsV2Response.parse(
          transformDbDatasetToAPIDataset(dataset),
        );
      },
    }),
});

export const [listDatasetsTool, handleListDatasets] = defineTool({
  name: "listDatasets",
  description: "List v2 datasets in the current Langfuse project.",
  baseSchema: GetDatasetsV2Query,
  inputSchema: GetDatasetsV2Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.datasets.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
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
            where: { projectId: context.projectId },
            orderBy: { createdAt: "desc" },
            take: input.limit,
            skip: (input.page - 1) * input.limit,
          }),
          prisma.dataset.count({ where: { projectId: context.projectId } }),
        ]);

        return GetDatasetsV2Response.parse({
          data: datasets,
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

export const [getDatasetTool, handleGetDataset] = defineTool({
  name: "getDataset",
  description: "Get a v2 dataset by name from the current Langfuse project.",
  baseSchema: GetDatasetV2Query,
  inputSchema: GetDatasetV2Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.datasets.get",
      context,
      attributes: { "mcp.dataset_name": input.datasetName },
      fn: async () => {
        const dataset = await prisma.dataset.findFirst({
          where: {
            name: input.datasetName,
            projectId: context.projectId,
          },
        });

        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }

        return GetDatasetV2Response.parse(
          transformDbDatasetToAPIDataset(dataset),
        );
      },
    }),
  readOnlyHint: true,
});

export const [createDatasetItemTool, handleCreateDatasetItem] = defineTool({
  name: "createDatasetItem",
  description: "Create or upsert a dataset item via the public API contract.",
  baseSchema: PostDatasetItemsV1Body,
  inputSchema: PostDatasetItemsV1Body,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_items.create",
      context,
      attributes: { "mcp.dataset_name": input.datasetName },
      fn: async () => {
        try {
          const datasetItem = await upsertDatasetItem({
            projectId: context.projectId,
            datasetName: input.datasetName,
            datasetItemId: input.id ?? undefined,
            input: input.input ?? undefined,
            expectedOutput: input.expectedOutput ?? undefined,
            metadata: input.metadata ?? undefined,
            sourceTraceId: input.sourceTraceId ?? undefined,
            sourceObservationId: input.sourceObservationId ?? undefined,
            status: input.status ?? undefined,
            normalizeOpts: { sanitizeControlChars: true },
            validateOpts: { normalizeUndefinedToNull: input.id ? false : true },
          });

          await auditLog({
            action: "create",
            resourceType: "datasetItem",
            resourceId: datasetItem.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: datasetItem,
          });

          return PostDatasetItemsV1Response.parse(
            transformDbDatasetItemDomainToAPIDatasetItem({
              ...datasetItem,
              datasetName: input.datasetName,
              status: datasetItem.status ?? "ACTIVE",
            }),
          );
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2025") {
              logger.warn(
                `Failed to upsert dataset item. Dataset item ${input.id} already exists for a different dataset than ${input.datasetName}`,
              );
              throw new LangfuseNotFoundError(
                `The dataset item with id ${input.id} already exists in a dataset other than ${input.datasetName}`,
              );
            }
            if (error.code === "P2002") {
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
      },
    }),
});

export const [listDatasetItemsTool, handleListDatasetItems] = defineTool({
  name: "listDatasetItems",
  description:
    "List dataset items, optionally filtered by dataset name, source trace, source observation, or version.",
  baseSchema: GetDatasetItemsV1Query,
  inputSchema: GetDatasetItemsV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_items.list",
      context,
      attributes: {
        "mcp.dataset_name": input.datasetName ?? undefined,
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        let datasetId: string | undefined;
        if (input.datasetName) {
          const dataset = await prisma.dataset.findFirst({
            where: {
              name: input.datasetName,
              projectId: context.projectId,
            },
          });
          if (!dataset) {
            throw new LangfuseNotFoundError("Dataset not found");
          }
          datasetId = dataset.id;
        }

        const filterState = createDatasetItemFilterState({
          ...(datasetId && { datasetIds: [datasetId] }),
          sourceTraceId: input.sourceTraceId ?? undefined,
          sourceObservationId: input.sourceObservationId ?? undefined,
          status: "ACTIVE",
        });

        const [items, totalItems] = await Promise.all([
          getDatasetItems({
            projectId: context.projectId,
            filterState,
            version: input.version ?? undefined,
            includeDatasetName: true,
            limit: input.limit,
            page: input.page - 1,
          }),
          getDatasetItemsCount({
            projectId: context.projectId,
            filterState,
            version: input.version ?? undefined,
          }),
        ]);

        return GetDatasetItemsV1Response.parse({
          data: items.map(transformDbDatasetItemDomainToAPIDatasetItem),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

export const [getDatasetItemTool, handleGetDatasetItem] = defineTool({
  name: "getDatasetItem",
  description: "Get a dataset item by ID.",
  baseSchema: GetDatasetItemV1Query,
  inputSchema: GetDatasetItemV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_items.get",
      context,
      attributes: { "mcp.dataset_item_id": input.datasetItemId },
      fn: async () => {
        const datasetItem = await getDatasetItemById({
          projectId: context.projectId,
          datasetItemId: input.datasetItemId,
        });

        if (!datasetItem) {
          throw new LangfuseNotFoundError("Dataset item not found");
        }

        const dataset = await prisma.dataset.findUnique({
          where: {
            id_projectId: {
              projectId: context.projectId,
              id: datasetItem.datasetId,
            },
          },
          select: { name: true },
        });

        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }

        return GetDatasetItemV1Response.parse(
          transformDbDatasetItemDomainToAPIDatasetItem({
            id: datasetItem.id,
            validFrom: datasetItem.validFrom,
            projectId: datasetItem.projectId,
            datasetId: datasetItem.datasetId,
            status: datasetItem.status ?? "ACTIVE",
            input: datasetItem.input,
            expectedOutput: datasetItem.expectedOutput,
            metadata: datasetItem.metadata,
            sourceTraceId: datasetItem.sourceTraceId,
            sourceObservationId: datasetItem.sourceObservationId,
            createdAt: datasetItem.createdAt,
            updatedAt: datasetItem.updatedAt,
            datasetName: dataset.name,
          }),
        );
      },
    }),
  readOnlyHint: true,
});

export const [deleteDatasetItemTool, handleDeleteDatasetItem] = defineTool({
  name: "deleteDatasetItem",
  description: "Delete a dataset item and all its run items.",
  baseSchema: DeleteDatasetItemV1Query,
  inputSchema: DeleteDatasetItemV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_items.delete",
      context,
      attributes: { "mcp.dataset_item_id": input.datasetItemId },
      fn: async () => {
        const result = await deleteDatasetItem({
          projectId: context.projectId,
          datasetItemId: input.datasetItemId,
        });

        await auditLog({
          action: "delete",
          resourceType: "datasetItem",
          resourceId: input.datasetItemId,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: result.deletedItem,
        });

        return DeleteDatasetItemV1Response.parse({
          message: "Dataset item successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});

export const [createDatasetRunItemTool, handleCreateDatasetRunItem] =
  defineTool({
    name: "createDatasetRunItem",
    description: "Create a dataset run item for a dataset item and trace.",
    baseSchema: PostDatasetRunItemsV1Body,
    inputSchema: PostDatasetRunItemsV1Body,
    handler: async (input, context) =>
      runPublicApiTool({
        spanName: "mcp.dataset_run_items.create",
        context,
        attributes: {
          "mcp.dataset_item_id": input.datasetItemId,
          "mcp.dataset_run_name": input.runName,
        },
        fn: async () => {
          const datasetItem = await getDatasetItemById({
            projectId: context.projectId,
            datasetItemId: input.datasetItemId,
            status: "ACTIVE",
            version: input.datasetVersion ?? undefined,
          });

          if (!datasetItem) {
            throw new LangfuseNotFoundError("Dataset item not found");
          }

          let finalTraceId = input.traceId;
          if (!input.traceId && input.observationId) {
            const observation = await getObservationById({
              id: input.observationId,
              projectId: context.projectId,
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

          const metadata = {
            ...(input.metadata ? resolveMetadata(input.metadata) : {}),
            ...(input.datasetVersion
              ? { dataset_version: input.datasetVersion.toISOString() }
              : {}),
          };
          const createdAt = input.createdAt
            ? new Date(input.createdAt)
            : new Date();

          const run = await createOrFetchDatasetRun({
            name: input.runName,
            description: input.runDescription ?? undefined,
            metadata,
            projectId: context.projectId,
            datasetId: datasetItem.datasetId,
            createdAt,
          });

          const runItemId = v4();
          const event = {
            id: runItemId,
            type: eventTypes.DATASET_RUN_ITEM_CREATE,
            timestamp: new Date().toISOString(),
            body: {
              id: runItemId,
              traceId: finalTraceId,
              observationId: input.observationId ?? undefined,
              error: null,
              createdAt: createdAt.toISOString(),
              datasetId: datasetItem.datasetId,
              runId: run.id,
              datasetItemId: datasetItem.id,
              datasetVersion: datasetItem.validFrom.toISOString(),
            },
          };

          const auth = await getMcpPublicApiAuth(context);
          const ingestionResult = await processEventBatch([event], auth, {
            isLangfuseInternal: true,
          });

          if (ingestionResult.errors.length > 0) {
            const error = ingestionResult.errors[0];
            throw new Error(error.error ?? error.message);
          }
          if (ingestionResult.successes.length !== 1) {
            logger.error("Failed to create dataset run item", {
              result: ingestionResult,
            });
            throw new Error("Failed to create dataset run item");
          }

          await addDatasetRunItemsToEvalQueue({
            projectId: context.projectId,
            datasetItemId: datasetItem.id,
            datasetItemValidFrom: datasetItem.validFrom,
            traceId: finalTraceId,
            observationId: input.observationId ?? undefined,
          });

          const mockDatasetRunItem: APIDatasetRunItem = {
            id: event.body.id,
            datasetRunId: run.id,
            datasetRunName: run.name,
            datasetItemId: datasetItem.id,
            traceId: finalTraceId,
            observationId: input.observationId ?? null,
            createdAt,
            updatedAt: createdAt,
          };

          return PostDatasetRunItemsV1Response.parse(mockDatasetRunItem);
        },
      }),
  });

export const [listDatasetRunItemsTool, handleListDatasetRunItems] = defineTool({
  name: "listDatasetRunItems",
  description: "List dataset run items by dataset ID and run name.",
  baseSchema: GetDatasetRunItemsV1Query,
  inputSchema: GetDatasetRunItemsV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_run_items.list",
      context,
      attributes: {
        "mcp.dataset_id": input.datasetId,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const datasetRun = await prisma.datasetRuns.findUnique({
          where: {
            datasetId_projectId_name: {
              datasetId: input.datasetId,
              name: input.runName,
              projectId: context.projectId,
            },
          },
          select: { id: true, name: true },
        });

        if (!datasetRun) {
          throw new LangfuseNotFoundError(
            "Dataset run not found for the given project and dataset id",
          );
        }

        const [items, count] = await Promise.all([
          generateDatasetRunItemsForPublicApi({
            props: {
              datasetId: input.datasetId,
              runId: datasetRun.id,
              projectId: context.projectId,
              limit: input.limit,
              page: input.page,
            },
          }),
          getDatasetRunItemsCountForPublicApi({
            props: {
              datasetId: input.datasetId,
              runId: datasetRun.id,
              projectId: context.projectId,
              limit: input.limit,
              page: input.page,
            },
          }),
        ]);

        const totalItems = count || 0;
        return GetDatasetRunItemsV1Response.parse({
          data: items,
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

export const [listDatasetRunsTool, handleListDatasetRuns] = defineTool({
  name: "listDatasetRuns",
  description: "List runs for a dataset by dataset name.",
  baseSchema: GetDatasetRunsV1Query,
  inputSchema: GetDatasetRunsV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_runs.list",
      context,
      attributes: { "mcp.dataset_name": input.name },
      fn: async () => {
        const dataset = await prisma.dataset.findFirst({
          where: {
            name: input.name,
            projectId: context.projectId,
          },
          include: {
            datasetRuns: {
              where: { projectId: context.projectId },
              take: input.limit,
              skip: (input.page - 1) * input.limit,
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }

        const totalItems = await prisma.datasetRuns.count({
          where: {
            datasetId: dataset.id,
            projectId: context.projectId,
          },
        });

        return GetDatasetRunsV1Response.parse({
          data: dataset.datasetRuns
            .map((run) => ({ ...run, datasetName: dataset.name }))
            .map(transformDbDatasetRunToAPIDatasetRun),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

export const [getDatasetRunTool, handleGetDatasetRun] = defineTool({
  name: "getDatasetRun",
  description: "Get a dataset run and its run items by dataset and run name.",
  baseSchema: GetDatasetRunV1Query,
  inputSchema: GetDatasetRunV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_runs.get",
      context,
      attributes: {
        "mcp.dataset_name": input.name,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const datasetRuns = await prisma.datasetRuns.findMany({
          where: {
            projectId: context.projectId,
            name: input.runName,
            dataset: {
              name: input.name,
              projectId: context.projectId,
            },
          },
          include: { dataset: { select: { name: true } } },
        });

        if (datasetRuns.length > 1) {
          throw new ApiError("Found more than one dataset run with this name");
        }
        if (!datasetRuns[0]) {
          throw new LangfuseNotFoundError("Dataset run not found");
        }

        const { dataset, ...run } = datasetRuns[0];
        const datasetRunItems = await generateDatasetRunItemsForPublicApi({
          props: {
            datasetId: run.datasetId,
            runId: run.id,
            projectId: context.projectId,
          },
        });

        return GetDatasetRunV1Response.parse({
          ...transformDbDatasetRunToAPIDatasetRun({
            ...run,
            datasetName: dataset.name,
          }),
          datasetRunItems,
        });
      },
    }),
  readOnlyHint: true,
});

export const [deleteDatasetRunTool, handleDeleteDatasetRun] = defineTool({
  name: "deleteDatasetRun",
  description: "Delete a dataset run and enqueue deletion of its run items.",
  baseSchema: DeleteDatasetRunV1Query,
  inputSchema: DeleteDatasetRunV1Query,
  handler: async (input, context) =>
    runPublicApiTool({
      spanName: "mcp.dataset_runs.delete",
      context,
      attributes: {
        "mcp.dataset_name": input.name,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const datasetRuns = await prisma.datasetRuns.findMany({
          where: {
            projectId: context.projectId,
            name: input.runName,
            dataset: {
              name: input.name,
              projectId: context.projectId,
            },
          },
        });

        if (datasetRuns.length === 0) {
          throw new LangfuseNotFoundError("Dataset run not found");
        }
        if (datasetRuns.length > 1) {
          throw new ApiError(
            "Found more than one dataset run with this name and dataset",
          );
        }

        const datasetRun = datasetRuns[0];
        await prisma.datasetRuns.delete({
          where: {
            id_projectId: {
              projectId: context.projectId,
              id: datasetRun.id,
            },
          },
        });

        await auditLog({
          action: "delete",
          resourceType: "datasetRun",
          resourceId: datasetRun.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: datasetRun,
        });

        await addToDeleteDatasetQueue({
          deletionType: "dataset-runs",
          projectId: context.projectId,
          datasetRunIds: [datasetRun.id],
          datasetId: datasetRun.datasetId,
        });

        return DeleteDatasetRunV1Response.parse({
          message: "Dataset run successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
