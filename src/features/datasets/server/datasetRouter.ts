import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const datasetRouter = createTRPCRouter({
  all: protectedProjectProcedure
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
        orderBy: {
          createdAt: "desc",
        },
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
  // byId: protectedProjectProcedure
  //   .input(
  //     z.object({
  //       projectId: z.string(),
  //       datasetId: z.string(),
  //     }),
  //   )
  //   .query(async ({ input, ctx }) => {
  //     return ctx.prisma.dataset.findUnique({
  //       where: {
  //         id: input.datasetId,
  //         projectId: input.projectId,
  //       },
  //       include: {
  //         datasetItem: true,
  //         datasetRuns: {
  //           include: {
  //             datasetRunItem: true,
  //           },
  //         },
  //       },
  //     });
  //   }),
});
