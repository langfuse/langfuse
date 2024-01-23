import { dashboardRouter } from "@/src/features/dashboard/server/dashboard-router";
import { datasetRouter } from "@/src/features/datasets/server/dataset-router";
import { playgroundHistoryRouter } from "@/src/features/playground/server/playground-history-router";
import { projectsRouter } from "@/src/features/projects/server/projectsRouter";
import { promptRouter } from "@/src/features/prompts/server/prompt-router";
import { apiKeysRouter } from "@/src/features/public-api/server/apiKeyRouter";
import { projectMembersRouter } from "@/src/features/rbac/server/projectMembersRouter";
import { usageMeteringRouter } from "@/src/features/usage-metering/server/usageMeteringRouter";
import { environmentRouter } from "@/src/server/api/routers/environment";
import { llmApiKeysRouter } from "@/src/server/api/routers/llmApiKeys";
import { observationsRouter } from "@/src/server/api/routers/observations";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import { userRouter } from "@/src/server/api/routers/users";
import { createTRPCRouter } from "@/src/server/api/trpc";
import { generationsRouter } from "./routers/generations";
import { scoresRouter } from "./routers/scores";
import { traceRouter } from "./routers/traces";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  traces: traceRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
  users: userRouter,
  apiKeys: apiKeysRouter,
  llmApiKeys: llmApiKeysRouter,
  projectMembers: projectMembersRouter,
  datasets: datasetRouter,
  environment: environmentRouter,
  usageMetering: usageMeteringRouter,
  observations: observationsRouter,
  prompts: promptRouter,
  playgroundHistories: playgroundHistoryRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
