import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { Prisma, type Dataset } from "@langfuse/shared/src/db";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";
import {
  paginationZod,
  DatasetStatus,
  singleFilter,
  StringNoHTML,
  StringNoHTMLNonEmpty,
} from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import {
  createDatasetRunsTable,
  createDatasetRunsTableWithoutMetrics,
  datasetRunsTableSchema,
  fetchDatasetItems,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";
import {
  getDatasetRunItemsTableCount,
  logger,
  getRunScoresGroupedByNameSourceType,
} from "@langfuse/shared/src/server";
import { createId as createCuid } from "@paralleldrive/cuid2";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";

const formatDatasetItemData = (data: string | null | undefined) => {
  if (data === "") return Prisma.DbNull;
  try {
    return !!data ? (JSON.parse(data) as Prisma.InputJsonObject) : undefined;
  } catch (e) {
    logger.info(
      "[trpc.datasets.formatDatasetItemData] failed to parse dataset item data",
      e,
    );
    return undefined;
  }
};

/**
 * Adds a case-insensitive search condition to a Kysely query
 * @param query The Kysely query to modify
 * @param searchQuery The search term (optional)
 * @param columnName The column to search in (defaults to "datasets.name")
 * @returns The modified query
 */
const addSearchCondition = <T extends Record<string, any>>(
  query: T,
  searchQuery?: string | null,
  columnName: string = "datasets.name",
): T => {
  if (!searchQuery || searchQuery.trim() === "") return query;

  // Add case-insensitive search condition
  return query.where(columnName, "ilike", `%${searchQuery}%`) as T;
};

export const datasetRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const dataset = await ctx.prisma.dataset.findFirst({
        where: {
          projectId: input.projectId,
        },
        select: { id: true },
        take: 1,
      });

      return dataset !== null;
    }),
  allDatasetMeta: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.dataset.findMany({
        where: {
          projectId: input.projectId,
        },
        select: {
          id: true,
          name: true,
        },
      });
    }),
  allDatasets: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        searchQuery: z.string().nullable(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      // Base query for both datasets and count
      const baseQuery = DB.selectFrom("datasets").where(
        "datasets.project_id",
        "=",
        input.projectId,
      );

      // Apply search condition to the base query
      const baseQueryWithSearch = addSearchCondition(
        baseQuery,
        input.searchQuery,
      );

      // Query for datasets
      const datasetsQuery = baseQueryWithSearch
        .select(({}) => [
          "datasets.id",
          "datasets.name",
          "datasets.description",
          "datasets.created_at as createdAt",
          "datasets.updated_at as updatedAt",
          "datasets.metadata",
        ])
        .orderBy("datasets.created_at", "desc")
        .limit(input.limit)
        .offset(input.page * input.limit);

      const compiledDatasetsQuery = datasetsQuery.compile();

      // Query for count
      const countQuery = baseQueryWithSearch.select(({ fn }) => [
        fn.count("datasets.id").as("count"),
      ]);

      const compiledCountQuery = countQuery.compile();

      const [datasets, countResult] = await Promise.all([
        ctx.prisma.$queryRawUnsafe<Array<Dataset>>(
          compiledDatasetsQuery.sql,
          ...compiledDatasetsQuery.parameters,
        ),
        ctx.prisma.$queryRawUnsafe<[{ count: string }]>(
          compiledCountQuery.sql,
          ...compiledCountQuery.parameters,
        ),
      ]);

      const totalDatasets = parseInt(countResult[0].count);

      return {
        totalDatasets,
        datasets,
      };
    }),
  allDatasetsMetrics: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetIds: z.array(z.string()) }))
    .query(async ({ input, ctx }) => {
      if (input.datasetIds.length === 0) return { metrics: [] };

      const query = DB.selectFrom("datasets")
        .leftJoin("dataset_items", (join) =>
          join
            .onRef("datasets.id", "=", "dataset_items.dataset_id")
            .on("dataset_items.project_id", "=", input.projectId),
        )
        .leftJoin("dataset_runs", (join) =>
          join
            .onRef("datasets.id", "=", "dataset_runs.dataset_id")
            .on("dataset_runs.project_id", "=", input.projectId),
        )
        .select(({ eb }) => [
          "datasets.id",
          eb.fn.count("dataset_items.id").distinct().as("countDatasetItems"),
          eb.fn.count("dataset_runs.id").distinct().as("countDatasetRuns"),
          eb.fn.max("dataset_runs.created_at").as("lastRunAt"),
        ])
        .where("datasets.project_id", "=", input.projectId)
        .where("datasets.id", "in", input.datasetIds)
        .groupBy("datasets.id");

      const compiledQuery = query.compile();

      const metrics = await ctx.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          countDatasetItems: number;
          countDatasetRuns: number;
          lastRunAt: Date | null;
        }>
      >(compiledQuery.sql, ...compiledQuery.parameters);

      return { metrics };
    }),
  // counts all dataset run items that match the filter
  countAllDatasetItems: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(), // Required for protectedProjectProcedure
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input }) => {
      const count = await getDatasetRunItemsTableCount({
        projectId: input.projectId,
        filter: input.filter ?? [],
      });

      return count;
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });
    }),
  runById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        runId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetRuns.findUnique({
        where: {
          id_projectId: {
            id: input.runId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
      });
    }),
  baseRunDataByDatasetId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetRuns.findMany({
        where: { datasetId: input.datasetId, projectId: input.projectId },
        select: {
          name: true,
          id: true,
          metadata: true,
          description: true,
          createdAt: true,
        },
      });
    }),
  runsByDatasetId: protectedProjectProcedure
    .input(datasetRunsTableSchema)
    .query(async ({ input, ctx }) => {
      // we cannot easily join all the tracing data with the dataset run items
      // hence, we pull the trace_ids and observation_ids separately for all run items
      // afterwards, we aggregate them per run
      const runs = await createDatasetRunsTableWithoutMetrics(input);

      const totalRuns = await ctx.prisma.datasetRuns.count({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
      });

      return {
        totalRuns,
        runs,
      };
    }),
  runsByDatasetIdMetrics: protectedProjectProcedure
    .input(datasetRunsTableSchema)
    .query(async ({ input, ctx }) => {
      // we cannot easily join all the tracing data with the dataset run items
      // hence, we pull the trace_ids and observation_ids separately for all run items
      // afterwards, we aggregate them per run
      const runs = await createDatasetRunsTable(input);

      const totalRuns = await ctx.prisma.datasetRuns.count({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
      });

      return {
        totalRuns,
        runs,
      };
    }),
  itemById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.findUnique({
        where: {
          id_projectId: { id: input.datasetItemId, projectId: input.projectId },
          datasetId: input.datasetId,
        },
      });
    }),
  itemsByDatasetId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      return fetchDatasetItems({
        projectId: input.projectId,
        datasetId: input.datasetId,
        limit: input.limit,
        page: input.page,
        prisma: ctx.prisma,
      });
    }),
  baseDatasetItemByDatasetId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      const datasetItems = await ctx.prisma.datasetItem.findMany({
        where: { datasetId: input.datasetId, projectId: input.projectId },
        select: {
          id: true,
          input: true,
          expectedOutput: true,
          metadata: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit,
        skip: input.page * input.limit,
      });

      const count = await ctx.prisma.datasetItem.count({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
      });

      return {
        datasetItems,
        totalCount: count,
      };
    }),
  updateDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
        input: z.string().optional(),
        expectedOutput: z.string().optional(),
        metadata: z.string().optional(),
        sourceTraceId: z.string().optional(),
        sourceObservationId: z.string().optional(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const datasetItem = await ctx.prisma.datasetItem.update({
        where: {
          id_projectId: {
            id: input.datasetItemId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
        data: {
          input:
            input.input === ""
              ? Prisma.DbNull
              : input.input !== undefined
                ? (JSON.parse(input.input) as Prisma.InputJsonObject)
                : undefined,
          expectedOutput:
            input.expectedOutput === ""
              ? Prisma.DbNull
              : input.expectedOutput !== undefined
                ? (JSON.parse(input.expectedOutput) as Prisma.InputJsonObject)
                : undefined,
          metadata:
            input.metadata === ""
              ? Prisma.DbNull
              : input.metadata !== undefined
                ? (JSON.parse(input.metadata) as Prisma.InputJsonObject)
                : undefined,
          sourceTraceId: input.sourceTraceId,
          sourceObservationId: input.sourceObservationId,
          status: input.status,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: input.datasetItemId,
        action: "update",
        after: datasetItem,
      });
      return datasetItem;
    }),
  createDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: StringNoHTMLNonEmpty,
        description: StringNoHTML.nullish(),
        metadata: z.string().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.create({
        data: {
          name: input.name,
          description: input.description ?? undefined,
          projectId: input.projectId,
          metadata:
            input.metadata === ""
              ? Prisma.DbNull
              : !!input.metadata
                ? (JSON.parse(input.metadata) as Prisma.InputJsonObject)
                : undefined,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: dataset.id,
        action: "create",
        after: dataset,
      });

      return dataset;
    }),
  updateDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        name: StringNoHTMLNonEmpty.nullish(),
        description: StringNoHTML.nullish(),
        metadata: z.string().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.update({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        data: {
          name: input.name ?? undefined,
          description: input.description,
          metadata:
            input.metadata === ""
              ? Prisma.DbNull
              : !!input.metadata
                ? (JSON.parse(input.metadata) as Prisma.InputJsonObject)
                : undefined,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: dataset.id,
        action: "update",
        after: dataset,
      });

      return dataset;
    }),
  deleteDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const deletedDataset = await ctx.prisma.dataset.delete({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: deletedDataset.id,
        action: "delete",
        before: deletedDataset,
      });
      return deletedDataset;
    }),
  deleteDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // First get the item to use in audit log
      const item = await ctx.prisma.datasetItem.findUnique({
        where: {
          id_projectId: {
            id: input.datasetItemId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset item not found",
        });
      }

      // Delete the dataset item
      const deletedItem = await ctx.prisma.datasetItem.delete({
        where: {
          id_projectId: {
            id: input.datasetItemId,
            projectId: input.projectId,
          },
          datasetId: input.datasetId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: deletedItem.id,
        action: "delete",
        before: item,
      });

      return deletedItem;
    }),
  duplicateDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        include: {
          datasetItems: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      // find a unique name for the new dataset
      // by appending a counter to the name in case of the name already exists
      // e.g. "Copy of dataset" -> "Copy of dataset (1)"
      const existingDatasetNames = (
        await ctx.prisma.dataset.findMany({
          select: {
            name: true,
          },
          where: {
            projectId: input.projectId,
            name: {
              startsWith: "Copy of " + dataset.name,
            },
          },
        })
      ).map((d) => d.name);
      let counter: number = 0;
      const duplicateDatasetName = (pCounter: number) =>
        pCounter === 0
          ? `Copy of ${dataset.name}`
          : `Copy of ${dataset.name} (${counter})`;
      while (true) {
        if (!existingDatasetNames.includes(duplicateDatasetName(counter))) {
          break;
        }
        counter++;
      }

      const newDataset = await ctx.prisma.dataset.create({
        data: {
          name: duplicateDatasetName(counter),
          description: dataset.description,
          projectId: input.projectId,
          metadata: dataset.metadata ?? undefined,
          datasetItems: {
            createMany: {
              data: dataset.datasetItems.map((item) => ({
                // the items get new ids as they need to be unique on project level
                input: item.input ?? undefined,
                expectedOutput: item.expectedOutput ?? undefined,
                metadata: item.metadata ?? undefined,
                sourceTraceId: item.sourceTraceId,
                sourceObservationId: item.sourceObservationId,
                status: item.status,
              })),
            },
          },
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: newDataset.id,
        action: "create",
        after: newDataset,
      });

      return { id: newDataset.id };
    }),

  createDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        input: z.string().nullish(),
        expectedOutput: z.string().nullish(),
        metadata: z.string().nullish(),
        sourceTraceId: z.string().optional(),
        sourceObservationId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });
      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      const datasetItem = await ctx.prisma.datasetItem.create({
        data: {
          input: formatDatasetItemData(input.input),
          expectedOutput: formatDatasetItemData(input.expectedOutput),
          metadata: formatDatasetItemData(input.metadata),
          datasetId: input.datasetId,
          sourceTraceId: input.sourceTraceId,
          sourceObservationId: input.sourceObservationId,
          projectId: input.projectId,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: datasetItem.id,
        action: "create",
        after: datasetItem,
      });
      return datasetItem;
    }),

  createManyDatasetItems: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        items: z.array(
          z.object({
            datasetId: z.string(),
            input: z.string().nullish(),
            expectedOutput: z.string().nullish(),
            metadata: z.string().nullish(),
            sourceTraceId: z.string().optional(),
            sourceObservationId: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // Verify all datasets exist and belong to the project
      const datasetIds = [
        ...new Set(input.items.map((item) => item.datasetId)),
      ];
      const datasets = await ctx.prisma.dataset.findMany({
        where: {
          id: { in: datasetIds },
          projectId: input.projectId,
        },
      });

      if (datasets.length !== datasetIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more datasets not found",
        });
      }

      const itemsWithIds = input.items.map((item) => ({
        id: createCuid(),
        input: formatDatasetItemData(item.input),
        expectedOutput: formatDatasetItemData(item.expectedOutput),
        metadata: formatDatasetItemData(item.metadata),
        datasetId: item.datasetId,
        sourceTraceId: item.sourceTraceId,
        sourceObservationId: item.sourceObservationId,
        projectId: input.projectId,
        status: DatasetStatus.ACTIVE,
      }));

      await ctx.prisma.datasetItem.createMany({
        data: itemsWithIds,
      });

      await Promise.all(
        itemsWithIds.map(async (item) =>
          auditLog({
            session: ctx.session,
            resourceType: "datasetItem",
            resourceId: item.id,
            action: "create",
            after: item,
          }),
        ),
      );

      return;
    }),

  runitemsByRunIdOrItemId: protectedProjectProcedure
    .input(
      z
        .object({
          projectId: z.string(),
          datasetRunId: z.string().optional(),
          datasetItemId: z.string().optional(),
          ...paginationZod,
        })
        .refine(
          (input) => input.datasetRunId || input.datasetItemId,
          "Must provide either datasetRunId or datasetItemId",
        ),
    )
    .query(async ({ input, ctx }) => {
      const filterQuery =
        input.datasetRunId && input.datasetItemId
          ? Prisma.sql`AND (dri.dataset_run_id = ${input.datasetRunId} OR dri.dataset_item_id = ${input.datasetItemId})`
          : input.datasetRunId
            ? Prisma.sql`AND dri.dataset_run_id = ${input.datasetRunId}`
            : input.datasetItemId
              ? Prisma.sql`AND dri.dataset_item_id = ${input.datasetItemId}`
              : Prisma.sql``;

      const runItems = await ctx.prisma.$queryRaw<
        Array<{
          id: string;
          traceId: string;
          observationId: string | null;
          createdAt: Date;
          updatedAt: Date;
          datasetItemCreatedAt: Date;
          datasetItemId: string;
          projectId: string;
          datasetRunId: string;
          datasetRunName: string;
        }>
      >`
        SELECT 
          di.id AS "datasetItemId",
          di.created_at AS "datasetItemCreatedAt",
          dri.id,
          dri.trace_id AS "traceId",
          dri.observation_id AS "observationId",
          dri.created_at AS "createdAt",
          dri.updated_at AS "updatedAt",
          dri.project_id AS "projectId",
          dri.dataset_run_id AS "datasetRunId",
          dr.name AS "datasetRunName"
        FROM dataset_run_items dri
        INNER JOIN dataset_items di
          ON dri.dataset_item_id = di.id 
          AND dri.project_id = di.project_id
        INNER JOIN dataset_runs dr
          ON dri.dataset_run_id = dr.id
          AND dri.project_id = dr.project_id
        WHERE 
          dri.project_id = ${input.projectId}
          ${filterQuery}
        ORDER BY 
          di.created_at DESC,
          di.id DESC
        LIMIT ${input.limit}
        OFFSET ${input.page * input.limit}
      `;

      if (runItems.length === 0) return { totalRunItems: 0, runItems: [] };

      const totalRunItems = await ctx.prisma.datasetRunItems.count({
        where: {
          projectId: input.projectId,
          datasetRunId: input.datasetRunId,
          datasetItemId: input.datasetItemId,
        },
      });

      // Add scores to the run items while also keeping the datasetRunName
      const runItemNameMap = runItems.reduce(
        (map, item) => {
          map[item.id] = item.datasetRunName;
          return map;
        },
        {} as Record<string, string>,
      );
      const parsedRunItems = (
        await getRunItemsByRunIdOrItemId(input.projectId, runItems)
      ).map((ri) => ({
        ...ri,
        datasetRunName: runItemNameMap[ri.id],
      }));

      // Note: We early return in case of no run items, when adding parameters here, make sure to update the early return above
      return {
        totalRunItems,
        runItems: parsedRunItems,
      };
    }),
  datasetItemsBasedOnTraceOrObservation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        observationId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.findMany({
        where: {
          projectId: input.projectId,
          sourceTraceId: input.traceId,
          sourceObservationId: input.observationId ?? null, // null as it should not include observations from the same trace
        },
        select: {
          dataset: {
            select: {
              id: true,
              name: true,
            },
          },
          id: true,
        },
        orderBy: {
          dataset: {
            name: "asc",
          },
        },
      });
    }),
  deleteDatasetRuns: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetRunIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      // Get all dataset runs first for audit logging
      const datasetRuns = await ctx.prisma.datasetRuns.findMany({
        where: {
          id: { in: input.datasetRunIds },
          projectId: input.projectId,
        },
      });

      // Delete all dataset runs
      await ctx.prisma.datasetRuns.deleteMany({
        where: {
          id: { in: input.datasetRunIds },
          projectId: input.projectId,
        },
      });

      // Log audit entries for each deleted run
      await Promise.all(
        datasetRuns.map((run) =>
          auditLog({
            session: ctx.session,
            resourceType: "datasetRun",
            resourceId: run.id,
            action: "delete",
            before: run,
          }),
        ),
      );
    }),
  getRunLevelScoreKeysAndProps: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (!dataset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dataset not found",
        });
      }

      const datasetRuns = await ctx.prisma.datasetRuns.findMany({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });

      if (datasetRuns.length === 0) {
        return [];
      }

      const res = await getRunScoresGroupedByNameSourceType(
        input.projectId,
        datasetRuns.map((dr) => dr.id),
        dataset.createdAt,
      );
      return res.map(({ name, source, dataType }) => ({
        key: composeAggregateScoreKey({ name, source, dataType }),
        name: name,
        source: source,
        dataType: dataType,
      }));
    }),
});
