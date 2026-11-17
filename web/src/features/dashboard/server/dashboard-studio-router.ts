import { z } from "zod";
import {
  StudioWidgetConfigSchema,
  singleFilterList,
  InvalidRequestError,
} from "@langfuse/shared";
import { granularities, viewVersions } from "@langfuse/shared/query";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { env } from "@/src/env.mjs";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { executeStudioWidget } from "./dashboard-studio-service";

export const dashboardStudioRouter = createTRPCRouter({
  isEnabled: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });
      return env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED === "true";
    }),
  execute: protectedProjectProcedure
    .input(
      z
        .object({
          projectId: z.string(),
          config: StudioWidgetConfigSchema,
          fromTimestamp: z.iso.datetime({ offset: true }),
          toTimestamp: z.iso.datetime({ offset: true }),
          version: viewVersions,
          granularity: granularities.default("auto"),
          filters: singleFilterList.default([]),
        })
        .refine(
          (input) =>
            new Date(input.fromTimestamp) < new Date(input.toTimestamp),
          { message: "fromTimestamp must be before toTimestamp" },
        ),
    )
    .query(({ input, signal }) => {
      if (
        input.version === "v2" &&
        env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
      )
        throw new InvalidRequestError(
          "v2 queries are not available on this deployment",
        );
      return executeStudioWidget(input, signal);
    }),
});
