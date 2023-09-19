import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type DatasetRuns, Prisma } from "@prisma/client";

export const datasetRouter = createTRPCRouter({
  allDatasets: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.prisma.dataset.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        include: {
          _count: {
            select: {
              datasetItem: true,
              datasetRuns: true,
            },
          },
        },
      });
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
      return ctx.prisma.$queryRaw<
        Array<DatasetRuns & { countRunItems: number }>
      >(Prisma.sql`
        SELECT
          runs.id,
          runs.name,
          runs.created_at "createdAt",
          runs.updated_at "updatedAt",
          count(distinct ri.id)::int "countRunItems"
        FROM dataset_runs runs
        JOIN datasets ON datasets.id = runs.dataset_id
        JOIN dataset_run_items ri ON ri.dataset_run_id = runs.id
        WHERE runs.dataset_id = ${input.datasetId}
        AND datasets.project_id = ${input.projectId}
        GROUP BY 1,2,3,4
        ORDER BY runs.created_at DESC
      `);
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
  updateItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
        input: z.string().optional(),
        expectedOutput: z.string().optional(),
        sourceObservationId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
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
        },
      });
    }),
  createDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.prisma.dataset.create({
        data: {
          name: input.name,
          projectId: input.projectId,
        },
      });
    }),
  archiveDataset: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.prisma.dataset.update({
        where: {
          id: input.datasetId,
          projectId: input.projectId,
        },
        data: {
          status: "ARCHIVED",
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
          input: input.input,
          expectedOutput: input.expectedOutput,
          datasetId: input.datasetId,
          sourceObservationId: input.sourceObservationId,
        },
      });
    }),
  archiveDatasetItem: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        datasetId: z.string(),
        datasetItemId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.prisma.datasetItem.update({
        where: {
          id: input.datasetItemId,
          datasetId: input.datasetId,
          dataset: {
            projectId: input.projectId,
          },
        },
        data: {
          status: "ARCHIVED",
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
      return ctx.prisma.datasetRunItem.findMany({
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
