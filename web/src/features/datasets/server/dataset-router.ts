import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { Prisma, type Dataset } from "@langfuse/shared/src/db";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";
import { paginationZod, DatasetStatus } from "@langfuse/shared";
import {
  createDatasetRunsTable,
  createDatasetRunsTableWithoutMetrics,
  datasetRunsTableSchema,
  fetchDatasetItems,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";
import { logger } from "@langfuse/shared/src/server";

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

export const datasetRouter = createTRPCRouter({
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
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
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
          "datasets.name",
          "datasets.description",
          "datasets.metadata",
          "datasets.created_at as createdAt",
          "datasets.updated_at as updatedAt",
          eb.fn.count("dataset_items.id").distinct().as("countDatasetItems"),
          eb.fn.count("dataset_runs.id").distinct().as("countDatasetRuns"),
          eb.fn.max("dataset_runs.created_at").as("lastRunAt"),
        ])
        .where("datasets.project_id", "=", input.projectId)
        .groupBy([
          "datasets.id",
          "datasets.name",
          "datasets.description",
          "datasets.metadata",
          "datasets.created_at",
          "datasets.updated_at",
        ])
        .orderBy("datasets.created_at", "desc")
        .limit(input.limit)
        .offset(input.page * input.limit);

      const compiledQuery = query.compile();

      const datasets = await ctx.prisma.$queryRawUnsafe<
        Array<
          Dataset & {
            countDatasetItems: number;
            countDatasetRuns: number;
            lastRunAt: Date | null;
          }
        >
      >(compiledQuery.sql, ...compiledQuery.parameters);

      const totalDatasets = await ctx.prisma.dataset.count({
        where: {
          projectId: input.projectId,
        },
      });

      return {
        totalDatasets,
        datasets,
      };
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
        orderBy: { createdAt: "desc" },
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
        name: z.string(),
        description: z.string().nullish(),
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
        name: z.string().nullish(),
        description: z.string().nullish(),
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
        throw new Error("Dataset not found");
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
        throw new Error("Dataset not found");
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
        datasetId: z.string(),
        items: z.array(
          z.object({
            input: z.string().nullish(),
            expectedOutput: z.string().nullish(),
            metadata: z.string().nullish(),
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

      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
      });

      if (!dataset) {
        throw new Error("Dataset not found");
      }

      const datasetItems = input.items.map((item) => ({
        input: formatDatasetItemData(item.input),
        expectedOutput: formatDatasetItemData(item.expectedOutput),
        metadata: formatDatasetItemData(item.metadata),
        datasetId: input.datasetId,
        projectId: input.projectId,
        status: DatasetStatus.ACTIVE,
      }));

      return await ctx.prisma.datasetItem.createMany({
        data: datasetItems,
      });
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
          dri.dataset_run_id AS "datasetRunId"
        FROM dataset_run_items dri
        INNER JOIN dataset_items di
          ON dri.dataset_item_id = di.id 
          AND dri.project_id = di.project_id
        WHERE 
          dri.project_id = ${input.projectId}
          ${filterQuery}
        ORDER BY 
          di.created_at DESC
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

      // Note: We early return in case of no run items, when adding parameters here, make sure to update the early return above
      return {
        totalRunItems,
        runItems: await getRunItemsByRunIdOrItemId(input.projectId, runItems),
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
  deleteDatasetRun: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetRunId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const deletedDatasetRun = await ctx.prisma.datasetRuns.delete({
        where: {
          id_projectId: {
            id: input.datasetRunId,
            projectId: input.projectId,
          },
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "datasetRun",
        resourceId: deletedDatasetRun.id,
        action: "delete",
        before: deletedDatasetRun,
      });
      return deletedDatasetRun;
    }),
});
