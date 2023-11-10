import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type DatasetRuns, Prisma, type Dataset } from "@prisma/client";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";

export const datasetRouter = createTRPCRouter({
  allDatasets: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.$queryRaw<
        Array<
          Dataset & {
            countDatasetItems: number;
            countDatasetRuns: number;
            lastRunAt: Date;
          }
        >
      >(Prisma.sql`
        SELECT
          d.id,
          d.name,
          d.created_at "createdAt",
          d.updated_at "updatedAt",
          d.status,
          count(distinct di.id)::int "countDatasetItems",
          count(distinct dr.id)::int "countDatasetRuns",
          max(dr.created_at) "lastRunAt"
        FROM datasets d
        LEFT JOIN dataset_items di ON di.dataset_id = d.id
        LEFT JOIN dataset_runs dr ON dr.dataset_id = d.id
        WHERE d.project_id = ${input.projectId}
        GROUP BY 1,2,3,4,5
        ORDER BY d.status ASC, d.created_at DESC
      `);
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
        latency_by_run_id AS (
          SELECT
            ri.dataset_run_id run_id,
            AVG(CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END)  AS "avgLatency"
          FROM
            dataset_run_items ri
            JOIN observations o ON o.id = ri.observation_id
          WHERE o.project_id = ${input.projectId}
          group by 1
        )

        SELECT
          runs.id,
          runs.name,
          runs.created_at "createdAt",
          runs.updated_at "updatedAt",
          COALESCE(avg_scores.scores, '[]'::jsonb) scores,
          COALESCE(latency."avgLatency", 0) "avgLatency",
          count(DISTINCT ri.id)::int "countRunItems"
        FROM
          dataset_runs runs
          JOIN datasets ON datasets.id = runs.dataset_id
          LEFT JOIN dataset_run_items ri ON ri.dataset_run_id = runs.id
          LEFT JOIN json_avg_scores_by_run_id avg_scores ON avg_scores.run_id = runs.id
          LEFT JOIN latency_by_run_id latency ON latency.run_id = runs.id
        WHERE runs.dataset_id = ${input.datasetId}
          AND datasets.project_id = ${input.projectId}
        GROUP BY
          1,
          2,
          3,
          4,
          5,
          6
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
      return ctx.prisma.datasetItem.update({
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
    }),
  createDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      return ctx.prisma.dataset.create({
        data: {
          name: input.name,
          projectId: input.projectId,
        },
      });
    }),
  updateDataset: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });
      return ctx.prisma.dataset.update({
        where: {
          id: input.datasetId,
          projectId: input.projectId,
        },
        data: {
          status: input.status,
          name: input.name,
        },
      });
    }),
  createDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        input: z.string(),
        expectedOutput: z.string(),
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

      return ctx.prisma.datasetItem.create({
        data: {
          input: JSON.parse(input.input) as Prisma.InputJsonObject,
          expectedOutput:
            input.expectedOutput === ""
              ? Prisma.DbNull
              : input.expectedOutput !== undefined
              ? (JSON.parse(input.expectedOutput) as Prisma.InputJsonObject)
              : undefined,
          datasetId: input.datasetId,
          sourceObservationId: input.sourceObservationId,
        },
      });
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
      return ctx.prisma.datasetRunItems.findMany({
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
