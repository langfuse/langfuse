import { z } from "zod/v4";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, singleFilter } from "@langfuse/shared";
import {
  getTotalUserCount,
  getTracesGroupedByUsers,
  getUserMetrics,
  hasAnyUser,
} from "@langfuse/shared/src/server";

const UserFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const UserAllOptions = UserFilterOptions.extend({
  ...paginationZod,
});

export const userRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return await hasAnyUser(input.projectId);
    }),

  all: protectedProjectProcedure
    .input(UserAllOptions)
    .query(async ({ input, ctx }) => {
      const [users, totalUsers] = await Promise.all([
        getTracesGroupedByUsers(
          ctx.session.projectId,
          input.filter ?? [],
          input.searchQuery ?? undefined,
          input.limit,
          input.page * input.limit,
          undefined,
        ),
        getTotalUserCount(
          ctx.session.projectId,
          input.filter ?? [],
          input.searchQuery ?? undefined,
        ),
      ]);

      return {
        totalUsers: totalUsers.shift()?.totalCount ?? 0,
        users: users.map((user) => ({
          userId: user.user,
          totalTraces: BigInt(user.count),
        })),
      };
    }),

  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userIds: z.array(z.string().min(1)),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input }) => {
      if (input.userIds.length === 0) {
        return [];
      }
      const metrics = await getUserMetrics(
        input.projectId,
        input.userIds,
        input.filter ?? [],
      );

      return metrics.map((metric) => ({
        userId: metric.userId,
        environment: metric.environment,
        firstTrace: metric.minTimestamp,
        lastTrace: metric.maxTimestamp,
        totalPromptTokens: BigInt(metric.inputUsage),
        totalCompletionTokens: BigInt(metric.outputUsage),
        totalTokens: BigInt(metric.totalUsage),
        totalObservations: BigInt(metric.observationCount),
        totalTraces: BigInt(metric.traceCount),
        sumCalculatedTotalCost: metric.totalCost,
      }));
    }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const result = (
        await getUserMetrics(input.projectId, [input.userId], [])
      ).shift();

      return {
        userId: input.userId,
        firstTrace: result?.minTimestamp,
        lastTrace: result?.maxTimestamp,
        totalTraces: result?.traceCount ?? 0,
        totalPromptTokens: result?.inputUsage ?? 0,
        totalCompletionTokens: result?.outputUsage ?? 0,
        totalTokens: result?.totalUsage ?? 0,
        totalObservations: result?.observationCount ?? 0,
        sumCalculatedTotalCost: result?.totalCost ?? 0,
      };
    }),
});
