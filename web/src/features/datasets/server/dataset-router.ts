import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type DatasetRuns,
  Prisma,
  type Dataset,
} from "@langfuse/shared/src/db";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";
import { filterAndValidateDbScoreList, paginationZod } from "@langfuse/shared";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { type ScoreSimplified } from "@/src/features/scores/lib/types";
import { traceException } from "@langfuse/shared/src/server";

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
  runsByDatasetId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      const scoresByRunId = await ctx.prisma.$queryRaw<
        Array<{ scores: Array<ScoreSimplified>; runId: string }>
      >(Prisma.sql`
        SELECT
          runs.id "runId",
          array_agg(s.score) AS "scores"
        FROM
          dataset_runs runs
          JOIN datasets ON datasets.id = runs.dataset_id AND datasets.project_id = ${input.projectId}
          LEFT JOIN LATERAL (
              SELECT
              jsonb_build_object ('name', s.name, 'stringValue', s.string_value, 'value', s.value, 'source', s."source", 'dataType', s.data_type, 'comment', s.comment) AS "score"
              FROM
                dataset_run_items ri
                JOIN scores s 
                  ON s.trace_id = ri.trace_id 
                  AND (ri.observation_id IS NULL OR s.observation_id = ri.observation_id)
                  AND s.project_id = ${input.projectId}
                JOIN traces t ON t.id = s.trace_id AND t.project_id = ${input.projectId}
              WHERE 
                ri.project_id = ${input.projectId}
                AND ri.dataset_run_id = runs.id
          ) s ON true
        WHERE 
          runs.dataset_id = ${input.datasetId}
          AND runs.project_id = ${input.projectId}
          AND s.score IS NOT NULL
        GROUP BY
          runs.id
        LIMIT ${input.limit}
        OFFSET ${input.page * input.limit}
      `);

      const runs = await ctx.prisma.$queryRaw<
        Array<
          DatasetRuns & {
            avgLatency: number;
            avgTotalCost: Prisma.Decimal;
            countRunItems: number;
          }
        >
      >(Prisma.sql`
        SELECT
          runs.id,
          runs.name,
          runs.description,
          runs.metadata,
          runs.created_at "createdAt",
          runs.updated_at "updatedAt",
          COALESCE(latency_and_total_cost."avgLatency", 0) "avgLatency",
          COALESCE(latency_and_total_cost."avgTotalCost", 0) "avgTotalCost",  
          COALESCE(run_items_count.count, 0)::int "countRunItems"
        FROM
          dataset_runs runs
          JOIN datasets ON datasets.id = runs.dataset_id AND datasets.project_id = ${input.projectId}
          LEFT JOIN LATERAL (
            SELECT
              AVG(o.latency) AS "avgLatency",
              AVG(COALESCE(o.calculated_total_cost, 0)) AS "avgTotalCost"
            FROM
              dataset_run_items ri
              JOIN observations_view o ON o.id = ri.observation_id AND o.project_id = ${input.projectId}
            WHERE 
              ri.project_id = ${input.projectId}
              AND ri.dataset_run_id = runs.id
          ) latency_and_total_cost ON true
          LEFT JOIN LATERAL (
            SELECT count(*) as count 
            FROM dataset_run_items ri 
            WHERE ri.dataset_run_id = runs.id
            AND ri.project_id = ${input.projectId}
          ) run_items_count ON true
        WHERE 
          runs.dataset_id = ${input.datasetId}
          AND runs.project_id = ${input.projectId}
        ORDER BY
          runs.created_at DESC
        LIMIT ${input.limit}
        OFFSET ${input.page * input.limit}
      `);

      const totalRuns = await ctx.prisma.datasetRuns.count({
        where: {
          datasetId: input.datasetId,
          projectId: input.projectId,
        },
      });

      return {
        totalRuns,
        runs: runs.map((run) => ({
          ...run,
          scores: aggregateScores(
            scoresByRunId.flatMap((s) => (s.runId === run.id ? s.scores : [])),
          ),
        })),
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
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id_projectId: {
            id: input.datasetId,
            projectId: input.projectId,
          },
        },
        include: {
          datasetItems: {
            orderBy: [
              {
                status: "asc",
              },
              {
                createdAt: "desc",
              },
            ],
            take: input.limit,
            skip: input.page * input.limit,
          },
        },
      });
      const datasetItems = dataset?.datasetItems ?? [];

      const totalDatasetItems = await ctx.prisma.datasetItem.count({
        where: {
          dataset: {
            id: input.datasetId,
            projectId: input.projectId,
          },
          projectId: input.projectId,
        },
      });

      return {
        totalDatasetItems,
        datasetItems,
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
          input:
            input.input === ""
              ? Prisma.DbNull
              : !!input.input
                ? (JSON.parse(input.input) as Prisma.InputJsonObject)
                : undefined,
          expectedOutput:
            input.expectedOutput === ""
              ? Prisma.DbNull
              : !!input.expectedOutput
                ? (JSON.parse(input.expectedOutput) as Prisma.InputJsonObject)
                : undefined,
          metadata:
            input.metadata === ""
              ? Prisma.DbNull
              : !!input.metadata
                ? (JSON.parse(input.metadata) as Prisma.InputJsonObject)
                : undefined,
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
      const runItems = await ctx.prisma.datasetRunItems.findMany({
        where: {
          projectId: input.projectId,
          datasetRunId: input.datasetRunId,
          datasetItemId: input.datasetItemId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: input.limit,
        skip: input.page * input.limit,
      });

      if (runItems.length === 0) return { totalRunItems: 0, runItems: [] };

      const traceScores = await ctx.prisma.score.findMany({
        where: {
          projectId: ctx.session.projectId,
          traceId: {
            in: runItems
              .filter((ri) => ri.observationId === null) // only include trace scores if run is not linked to an observation
              .map((ri) => ri.traceId),
          },
        },
      });
      const observationScores = await ctx.prisma.score.findMany({
        where: {
          projectId: ctx.session.projectId,
          observationId: {
            in: runItems
              .filter((ri) => ri.observationId !== null)
              .map((ri) => ri.observationId) as string[],
          },
        },
      });

      const totalRunItems = await ctx.prisma.datasetRunItems.count({
        where: {
          projectId: input.projectId,
          datasetRunId: input.datasetRunId,
          datasetItemId: input.datasetItemId,
        },
      });

      const observations = await ctx.prisma.observationView.findMany({
        where: {
          id: {
            in: runItems
              .map((ri) => ri.observationId)
              .filter(Boolean) as string[],
          },
          projectId: ctx.session.projectId,
        },
        select: {
          id: true,
          latency: true,
          calculatedTotalCost: true,
        },
      });

      // Directly access 'traces' table and calculate duration via lateral join
      // Previously used 'traces_view' was not performant enough
      const traceIdsSQL = Prisma.sql`ARRAY[${Prisma.join(runItems.map((ri) => ri.traceId))}]`;
      const traces = await ctx.prisma.$queryRaw<
        {
          id: string;
          duration: number;
        }[]
      >(
        Prisma.sql`
            SELECT
              t.id,
              o.duration
            FROM
              traces t
              LEFT JOIN LATERAL (
                SELECT
                  EXTRACT(epoch FROM COALESCE(max(o1.end_time), max(o1.start_time)))::double precision - EXTRACT(epoch FROM min(o1.start_time))::double precision AS duration
                FROM
                  observations o1
                WHERE
                  o1.project_id = ${input.projectId}
                  AND o1.trace_id = t.id
                GROUP BY
                  o1.project_id,
                  o1.trace_id) o ON TRUE
            WHERE
              t.project_id = ${input.projectId}
              AND t.id = ANY(${traceIdsSQL})        
        `,
      );

      const validatedTraceScores = filterAndValidateDbScoreList(
        traceScores,
        traceException,
      );
      const validatedObservationScores = filterAndValidateDbScoreList(
        observationScores,
        traceException,
      );

      const items = runItems.map((ri) => {
        return {
          id: ri.id,
          createdAt: ri.createdAt,
          datasetItemId: ri.datasetItemId,
          observation: observations.find((o) => o.id === ri.observationId),
          trace: traces.find((t) => t.id === ri.traceId),
          scores: aggregateScores([
            ...validatedTraceScores.filter((s) => s.traceId === ri.traceId),
            ...validatedObservationScores.filter(
              (s) =>
                s.observationId === ri.observationId &&
                s.traceId === ri.traceId,
            ),
          ]),
        };
      });

      // Note: We early return in case of no run items, when adding parameters here, make sure to update the early return above
      return {
        totalRunItems,
        runItems: items,
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
});
