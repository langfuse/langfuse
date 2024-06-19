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
import { usageMeteringRouter } from "@/src/features/usage-metering/server/usageMeteringRouter";
import { observationsRouter } from "@/src/server/api/routers/observations";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import { promptRouter } from "@/src/features/prompts/server/routers/promptRouter";
import { modelRouter } from "@/src/server/api/routers/models";
import { evalRouter } from "@/src/ee/features/evals/server/router";
import { posthogIntegrationRouter } from "@/src/features/posthog-integration/posthog-integration-router";
import { llmApiKeyRouter } from "@/src/features/llm-api-key/server/router";
import { scoreConfigsRouter } from "@/src/server/api/routers/scoreConfigs";
import { publicRouter } from "@/src/server/api/routers/public";
import { credentialsRouter } from "@/src/features/auth-credentials/server/credentialsRouter";
import { batchExportRouter } from "@/src/server/api/routers/batchExport";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  batchExport: batchExportRouter,
  traces: traceRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  scoreConfigs: scoreConfigsRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
  users: userRouter,
  apiKeys: apiKeysRouter,
  projectMembers: projectMembersRouter,
  datasets: datasetRouter,
  usageMetering: usageMeteringRouter,
  observations: observationsRouter,
  prompts: promptRouter,
  models: modelRouter,
  evals: evalRouter,
  posthogIntegration: posthogIntegrationRouter,
  llmApiKey: llmApiKeyRouter,
  public: publicRouter,
  credentials: credentialsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
