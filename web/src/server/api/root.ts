import { createTRPCRouter } from "@/src/server/api/trpc";
import { traceRouter } from "./routers/traces";
import { generationsRouter } from "./routers/generations";
import { scoresRouter } from "./routers/scores";
import { dashboardRouter } from "@/src/features/dashboard/server/dashboard-router";
import { projectsRouter } from "@/src/features/projects/server/projectsRouter";
import { apiKeysRouter } from "@/src/features/public-api/server/apiKeyRouter";
import { membersRouter } from "@/src/features/rbac/server/membersRouter";
import { userRouter } from "@/src/server/api/routers/users";
import { datasetRouter } from "@/src/features/datasets/server/dataset-router";
import { cloudBillingRouter } from "@/src/ee/features/billing/server/cloudBillingRouter";
import { observationsRouter } from "@/src/server/api/routers/observations";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import { promptRouter } from "@/src/features/prompts/server/routers/promptRouter";
import { modelRouter } from "@/src/server/api/routers/models";
import { evalRouter } from "@/src/ee/features/evals/server/router";
import { posthogIntegrationRouter } from "@/src/features/posthog-integration/posthog-integration-router";
import { llmApiKeyRouter } from "@/src/features/llm-api-key/server/router";
import { organizationsRouter } from "@/src/features/organizations/server/organizationRouter";
import { scoreConfigsRouter } from "@/src/server/api/routers/scoreConfigs";
import { publicRouter } from "@/src/server/api/routers/public";
import { credentialsRouter } from "@/src/features/auth-credentials/server/credentialsRouter";
import { batchExportRouter } from "@/src/server/api/routers/batchExport";
import { utilsRouter } from "@/src/server/api/routers/utilities";
import { uiCustomizationRouter } from "@/src/ee/features/ui-customization/uiCustomizationRouter";
import { commentsRouter } from "@/src/server/api/routers/comments";
<<<<<<< HEAD
import { queueRouter } from "@/src/ee/features/annotation-queues/server/annotationQueues";
import { queueItemRouter } from "@/src/ee/features/annotation-queues/server/annotationQueueItems";
import { experimentsRouter } from "@/src/ee/features/experiments/server/router";
import { mediaRouter } from "@/src/server/api/routers/media";
=======
import { commentReactionsRouter } from "@/src/server/api/routers/commentReactions";
import { queueRouter } from "@/src/features/annotation-queues/server/annotationQueuesRouter";
import { queueItemRouter } from "@/src/features/annotation-queues/server/annotationQueueItemsRouter";
import { experimentsRouter } from "@/src/features/experiments/server/router";
import { mediaRouter } from "@/src/server/api/routers/media";
import { backgroundMigrationsRouter } from "@/src/features/background-migrations/server/background-migrations-router";
import { auditLogsRouter } from "./routers/auditLogs";
import { tableRouter } from "@/src/features/table/server/tableRouter";
import { cloudStatusRouter } from "@/src/features/cloud-status-notification/server/cloud-status-router";
import { dashboardWidgetRouter } from "./routers/dashboardWidgets";
import { TableViewPresetsRouter } from "@/src/server/api/routers/tableViewPresets";
import { automationsRouter } from "@/src/features/automations/server/router";
import { defaultEvalModelRouter } from "@/src/features/evals/server/defaultEvalModelRouter";
import { slackRouter } from "@/src/features/slack/server/router";
import { plainRouter } from "@/src/features/support-chat/trpc/plainRouter";
import { queueAssignmentRouter } from "@/src/features/annotation-queues/server/annotationQueueAssignmentsRouter";
import { surveysRouter } from "@/src/server/api/routers/surveys";
import { naturalLanguageFilterRouter } from "@/src/features/natural-language-filters/server/router";
import { notificationPreferencesRouter } from "@/src/server/api/routers/notificationPreferences";
>>>>>>> 67990ebfd (chore: protect allFromProject (#10136))

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  annotationQueues: queueRouter,
  annotationQueueItems: queueItemRouter,
  batchExport: batchExportRouter,
  traces: traceRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  scoreConfigs: scoreConfigsRouter,
  dashboard: dashboardRouter,
  organizations: organizationsRouter,
  projects: projectsRouter,
  users: userRouter,
  apiKeys: apiKeysRouter,
  members: membersRouter,
  datasets: datasetRouter,
  cloudBilling: cloudBillingRouter,
  observations: observationsRouter,
  prompts: promptRouter,
  models: modelRouter,
  evals: evalRouter,
  experiments: experimentsRouter,
  posthogIntegration: posthogIntegrationRouter,
  llmApiKey: llmApiKeyRouter,
  public: publicRouter,
  credentials: credentialsRouter,
  utilities: utilsRouter,
  uiCustomization: uiCustomizationRouter,
  comments: commentsRouter,
  media: mediaRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
