import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type DatasetRuns, Prisma, type Dataset } from "@prisma/client";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DB } from "@/src/server/db";

export const datasetRouter = createTRPCRouter({
  allDatasets: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const query = DB.selectFrom("datasets")
        .leftJoin("dataset_items", "datasets.id", "dataset_items.dataset_id")
        .leftJoin("dataset_runs", "datasets.id", "dataset_runs.dataset_id")
        .select(({ eb }) => [
          "datasets.id",
          "datasets.name",
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
          "datasets.created_at",
          "datasets.updated_at",
        ])
        .orderBy("datasets.created_at", "desc");

      const compiledQuery = query.compile();

      return await ctx.prisma.$queryRawUnsafe<
        Array<
          Dataset & {
            countDatasetItems: number;
            countDatasetRuns: number;
            lastRunAt: Date | null;
          }
        >
      >(compiledQuery.sql, ...compiledQuery.parameters);
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
          id: input.datasetId,
          projectId: input.projectId,
        },
      });
    }),
  runsByDatasetId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const runs = await ctx.prisma.$queryRaw<
        Array<
          DatasetRuns & {
            countRunItems: number;
            scores: Record<string, number>;
            avgLatency: number;
            avgTotalCost: Prisma.Decimal;
          }
        >
      >(Prisma.sql`
        WITH avg_scores_by_run_id AS (
          SELECT
            ri.dataset_run_id run_id,
            s.name score_name,
            AVG(s.value) AS average_score_value
          FROM
            dataset_run_items ri
            JOIN observations o ON o.id = ri.observation_id
            JOIN scores s ON s.trace_id = o.trace_id
          WHERE o.project_id = ${input.projectId}
          GROUP BY
            ri.dataset_run_id,
            s.name
          ORDER BY
            1,
            2
        ),
        json_avg_scores_by_run_id AS (
          SELECT
            run_id,
            jsonb_object_agg(score_name,
              average_score_value) AS scores
          FROM
            avg_scores_by_run_id
          GROUP BY
            run_id
          ORDER BY
            run_id
        ),
        latency_and_total_cost_by_run_id AS (
          SELECT
            ri.dataset_run_id run_id,
            AVG(CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END)  AS "avgLatency",
            AVG(COALESCE(o.calculated_total_cost, 0)) AS "avgTotalCost"
          FROM
            dataset_run_items ri
            JOIN observations_view o ON o.id = ri.observation_id
          WHERE o.project_id = ${input.projectId}
          group by 1
        )

        SELECT
          runs.id,
          runs.name,
          runs.created_at "createdAt",
          runs.updated_at "updatedAt",
          COALESCE(avg_scores.scores, '[]'::jsonb) scores,
          COALESCE(latency_and_total_cost."avgLatency", 0) "avgLatency",
          COALESCE(latency_and_total_cost."avgTotalCost", 0) "avgTotalCost",  
          count(DISTINCT ri.id)::int "countRunItems"
        FROM
          dataset_runs runs
          JOIN datasets ON datasets.id = runs.dataset_id
          LEFT JOIN dataset_run_items ri ON ri.dataset_run_id = runs.id
          LEFT JOIN json_avg_scores_by_run_id avg_scores ON avg_scores.run_id = runs.id
          LEFT JOIN latency_and_total_cost_by_run_id latency_and_total_cost ON latency_and_total_cost.run_id = runs.id
        WHERE runs.dataset_id = ${input.datasetId}
          AND datasets.project_id = ${input.projectId}
        GROUP BY
          1,
          2,
          3,
          4,
          5,
          6,
          7
        ORDER BY
          runs.created_at DESC
      `);

      return runs;
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
          id: input.datasetItemId,
          datasetId: input.datasetId,
          dataset: {
            projectId: input.projectId,
          },
        },
      });
    }),
  itemsByDatasetId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.findMany({
        where: {
          datasetId: input.datasetId,
          dataset: {
            projectId: input.projectId,
          },
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
      });
    }),
  updateDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
        input: z.string().optional(),
        expectedOutput: z.string().optional(),
        sourceObservationId: z.string().optional(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const datasetItem = await ctx.prisma.datasetItem.update({
        where: {
          id: input.datasetItemId,
          datasetId: input.datasetId,
          dataset: {
            projectId: input.projectId,
          },
        },
        data: {
          input:
            input.input !== undefined
              ? (JSON.parse(input.input) as Prisma.InputJsonObject)
              : undefined,
          expectedOutput:
            input.expectedOutput === ""
              ? Prisma.DbNull
              : input.expectedOutput !== undefined
                ? (JSON.parse(input.expectedOutput) as Prisma.InputJsonObject)
                : undefined,
          sourceObservationId: input.sourceObservationId,
          status: input.status,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: input.datasetItemId,
        projectId: input.projectId,
        action: "update",
        after: datasetItem,
      });
      return datasetItem;
    }),
  createDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.create({
        data: {
          name: input.name,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: dataset.id,
        projectId: input.projectId,
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
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.update({
        where: {
          id: input.datasetId,
          projectId: input.projectId,
        },
        data: {
          name: input.name,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: dataset.id,
        projectId: input.projectId,
        action: "update",
        before: { name: input.name },
        after: dataset,
      });

      return dataset;
    }),
  deleteDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const deletedDataset = await ctx.prisma.dataset.delete({
        where: {
          id: input.datasetId,
          projectId: input.projectId,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "dataset",
        resourceId: deletedDataset.id,
        projectId: input.projectId,
        action: "delete",
        before: deletedDataset,
      });
      return deletedDataset;
    }),
  createDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        input: z.string(),
        expectedOutput: z.string().nullish(),
        sourceObservationId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      const dataset = await ctx.prisma.dataset.findUnique({
        where: {
          id: input.datasetId,
          projectId: input.projectId,
        },
      });
      if (!dataset) {
        throw new Error("Dataset not found");
      }

      const datasetItem = await ctx.prisma.datasetItem.create({
        data: {
          input: JSON.parse(input.input) as Prisma.InputJsonObject,
          expectedOutput:
            input.expectedOutput === ""
              ? Prisma.DbNull
              : !!input.expectedOutput
                ? (JSON.parse(input.expectedOutput) as Prisma.InputJsonObject)
                : undefined,
          datasetId: input.datasetId,
          sourceObservationId: input.sourceObservationId,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "datasetItem",
        resourceId: datasetItem.id,
        projectId: input.projectId,
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
          datasetId: z.string(),
          datasetRunId: z.string().optional(),
          datasetItemId: z.string().optional(),
        })
        .refine(
          (input) => input.datasetRunId || input.datasetItemId,
          "Must provide either datasetRunId or datasetItemId",
        ),
    )
    .query(async ({ input, ctx }) => {
      const runItems = await ctx.prisma.datasetRunItems.findMany({
        where: {
          datasetRunId: input.datasetRunId,
          datasetItemId: input.datasetItemId,
          datasetRun: {
            dataset: {
              projectId: input.projectId,
            },
          },
        },
        include: {
          datasetItem: true,
          observation: {
            include: {
              scores: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const observationIds = runItems.map((ri) => ri.observationId);
      const observations = await ctx.prisma.observationView.findMany({
        select: {
          id: true,
          calculatedTotalCost: true,
        },
        where: {
          id: {
            in: observationIds,
          },
        },
      });

      return runItems.map((ri) => {
        return {
          id: ri.id,
          createdAt: ri.createdAt,
          datasetItemId: ri.datasetItemId,
          observation: {
            ...ri.observation,
            ...observations.find((o) => o.id === ri.observationId),
          },
        };
      });
    }),
  observationInDatasets: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        observationId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.findMany({
        where: {
          sourceObservationId: input.observationId,
          dataset: {
            projectId: input.projectId,
          },
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
