import { createTRPCRouter } from "@/src/server/api/trpc";
import { traceRouter } from "./routers/traces";
import { generationsRouter } from "./routers/generations";
import { scoresRouter } from "./routers/scores";
import { dashboardRouter } from "@/src/features/dashboard/server/dashboard-router";
import { projectsRouter } from "@/src/features/projects/server/projectsRouter";
import { apiKeysRouter } from "@/src/features/public-api/server/apiKeyRouter";
import { projectMembersRouter } from "@/src/features/rbac/server/projectMembersRouter";
import { userRouter } from "@/src/server/api/routers/users";
import { datasetRouter } from "@/src/features/datasets/server/dataset-router";
import { environmentRouter } from "@/src/server/api/routers/environment";
import { usageMeteringRouter } from "@/src/features/usage-metering/server/usageMeteringRouter";
import { observationsRouter } from "@/src/server/api/routers/observations";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import { alertsRouter } from "@/src/server/api/routers/alerts";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  traces: traceRouter,
  alerts: alertsRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
  users: userRouter,
  apiKeys: apiKeysRouter,
  projectMembers: projectMembersRouter,
  datasets: datasetRouter,
  environment: environmentRouter,
  usageMetering: usageMeteringRouter,
  observations: observationsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
