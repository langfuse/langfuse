import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const UserFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

export const userRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(UserFilterOptions)
    .query(async ({ input, ctx }) => {
      const traces = await ctx.prisma.trace.groupBy({
        where: {
          AND: [
            {
              projectId: input.projectId,
            },
          ],
        },
        by: ["userId"],
        _count: {
          _all: true,
        },
        take: 50,
        orderBy: {
          _count: { userId: "desc" },
        },
      });

      const userIds = traces
        .map((t) => t.userId)
        .filter((s): s is string => Boolean(s));

      const traceAnalytics = await ctx.prisma.trace.groupBy({
        where: {
          userId: {
            in: userIds,
          },
        },
        _min: {
          timestamp: true,
        },
        _max: {
          timestamp: true,
        },
        _count: {
          _all: true,
        },
        by: ["userId"],
      });

      return userIds.map((userId) => {
        const trace = traces.find((t) => t.userId === userId);
        const analytics = traceAnalytics.find((t) => t.userId === userId);

        return {
          userId,
          firstEvent: analytics?._min?.timestamp,
          lastEvent: analytics?._max?.timestamp,
          totalTraces: trace?._count?._all,
          totalObservations: analytics?._count?._all,
        };
      });
    }),
  // availableFilterOptions: protectedProjectProcedure
  //   .input(UserFilterOptions)
  //   .query(async ({ input, ctx }) => {
  //     const filter = {
  //       AND: [
  //         {
  //           projectId: input.projectId,
  //         },
  //       ],
  //     };

  //     const traces = ctx.prisma.trace.groupBy({
  //       where: filter,
  //       by: ["userId"],
  //       _count: {
  //         _all: true,
  //       },
  //     });

  //     return [
  //       {
  //         key: "users",
  //         occurrences: traces.map((i) => {
  //           return { key: i.name ?? "undefined", count: i._count };
  //         }),
  //       },
  //     ];
  //   }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const trace = await ctx.prisma.trace.groupBy({
        where: {
          AND: [
            {
              projectId: input.projectId,
              userId: input.userId,
            },
          ],
        },
        by: ["userId"],
        _count: {
          _all: true,
        },
        take: 50,
        orderBy: {
          _count: { userId: "desc" },
        },
      });

      const traceAnalytics = await ctx.prisma.trace.groupBy({
        where: {
          userId: input.userId,
        },
        _min: {
          timestamp: true,
        },
        _max: {
          timestamp: true,
        },
        _count: {
          _all: true,
        },
        by: ["userId"],
      });

      console.log("trace", trace);
      console.log("traceAnalytics", traceAnalytics);

      if (trace.length === 0 || traceAnalytics.length === 0)
        throw new Error("unexpected database result");

      return {
        userId: input.userId,
        firstEvent: traceAnalytics[0]?._min?.timestamp,
        lastEvent: traceAnalytics[0]?._max?.timestamp,
        totalTraces: trace[0]?._count?._all,
        totalObservations: traceAnalytics[0]?._count?._all,
      };
    }),
});
