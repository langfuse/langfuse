import { createTRPCRouter } from "@/src/server/api/trpc";
import { traceRouter } from "./routers/traces";
import { generationsRouter } from "./routers/generations";
import { eventsRouter } from "@/src/tracing/observations/server/eventsRouter";
import { scoresRouter } from "./routers/scores";
import { scoreAnalyticsRouter } from "@/src/analytics/score-reporting/server/scoreAnalyticsRouter";
import { dashboardRouter } from "@/src/analytics/dashboards/server/dashboard-router";
import { projectsRouter } from "@/src/identity/projects/server";
import { projectApiKeysRouter } from "@/src/public-api/server/projectApiKeyRouter";
import { membersRouter } from "@/src/identity/access-control/server/membersRouter";
import { userRouter } from "@/src/server/api/routers/users";
import { userAccountRouter } from "@/src/server/api/routers/userAccount";
import { datasetRouter } from "@/src/datasets/server/dataset-router";
import { cloudBillingRouter } from "@/src/ee/billing/server/cloudBillingRouter";
import { spendAlertRouter } from "@/src/ee/billing/server/spendAlertRouter";
import { observationsRouter } from "@/src/server/api/routers/observations";
import { sessionRouter } from "@/src/server/api/routers/sessions";
import { promptRouter } from "@/src/prompt-management/server/routers/promptRouter";
import { modelRouter } from "@/src/server/api/routers/models";
import { evalRouter } from "@/src/evaluators/server/router";
import { evaluatorRouter } from "@/src/evaluators/v2/server/evaluators/evaluatorRouter";
import { posthogIntegrationRouter } from "@/src/analytics/customer-integrations/posthog/posthog-integration-router";
import { mixpanelIntegrationRouter } from "@/src/analytics/customer-integrations/mixpanel/mixpanel-integration-router";
import { blobStorageIntegrationRouter } from "@/src/data-export/object-storage/blobstorage-integration-router";
import { externalMediaStorageRouter } from "@/src/integrations/media-storage/server";
import { llmApiKeyRouter } from "@/src/ai/provider-connections/server/router";
import { organizationLlmApiKeyRouter } from "@/src/ai/provider-connections/server/organizationRouter";
import { llmSchemaRouter } from "@/src/playground/structured-output/server/router";
import { llmToolRouter } from "@/src/playground/tools/server/router";
import { organizationsRouter } from "@/src/identity/organizations/server/organizationRouter";
import { organizationUsageRouter } from "@/src/billing/usage/server/organizationUsageRouter";
import { organizationApiKeysRouter } from "@/src/public-api/server/organizationApiKeyRouter";
import { verifiedDomainRouter } from "@/src/ee/identity/auth/verified-domains/server/verifiedDomainRouter";
import { ssoConfigRouter } from "@/src/ee/identity/auth/sso-runtime/server/ssoConfigRouter";
import { scoreConfigsRouter } from "@/src/server/api/routers/scoreConfigs";
import { publicRouter } from "@/src/server/api/routers/public";
import { credentialsRouter } from "@/src/identity/auth/passwords/server/credentialsRouter";
import { batchExportRouter } from "@/src/data-export/on-demand/server/batchExport";
import { utilsRouter } from "@/src/server/api/routers/utilities";
import { uiCustomizationRouter } from "@/src/ee/app/branding/uiCustomizationRouter";
import { commentsRouter } from "@/src/server/api/routers/comments";
import { commentReactionsRouter } from "@/src/server/api/routers/commentReactions";
import { queueRouter } from "@/src/annotation/queues/server/annotationQueuesRouter";
import { queueItemRouter } from "@/src/annotation/queues/server/annotationQueueItemsRouter";
import { experimentsRouter } from "@/src/experiments/server/router";
import { mediaRouter } from "@/src/server/api/routers/media";
import { backgroundMigrationsRouter } from "@/src/operations/background-migrations/server/background-migrations-router";
import { auditLogsRouter } from "./routers/auditLogs";
import { tableRouter } from "@/src/app/tables/server/tableRouter";
import { batchActionRouter } from "@/src/background-jobs/batch-actions/server/batchActionRouter";
import { cloudStatusRouter } from "@/src/app/shell/cloud-status-notification/server/cloud-status-router";
import { dashboardWidgetRouter } from "./routers/dashboardWidgets";
import { TableViewPresetsRouter } from "@/src/server/api/routers/tableViewPresets";
import { automationsRouter } from "@/src/automation/server/router";
import { monitorsRouter } from "@/src/server/api/routers/monitors";
import { defaultEvalModelRouter } from "@/src/evaluators/server/defaultEvalModelRouter";
import { slackRouter } from "@/src/automation/slack/server/router";
import { supportRouter } from "@/src/app/support/trpc/supportRouter";
import { queueAssignmentRouter } from "@/src/annotation/queues/server/annotationQueueAssignmentsRouter";
import { naturalLanguageFilterRouter } from "@/src/app/search/natural-language/server/router";
import { searchBarRouter } from "@/src/app/search/server/router";
import { notificationPreferencesRouter } from "@/src/server/api/routers/notificationPreferences";
import { onboardingRouter } from "@/src/app/onboarding/server/onboardingRouter";
import { webCalloutsRouter } from "@/src/integrations/web-callouts/server/router";
import { inAppAgentRouter } from "@/src/ai/assistant/server/router";
import { v4TransitionRouter } from "@/src/migrations/v4/backend/server/v4TransitionRouter";
import { aiGatewayRouter } from "@/src/ai/gateway/management-ui/server";
import { topicsRouter } from "@/src/ai/trace-analysis/server/topicsRouter";
import { skillRouter } from "@/src/ai/skills/server/skill-router";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  topics: topicsRouter,
  annotationQueues: queueRouter,
  annotationQueueItems: queueItemRouter,
  annotationQueueAssignments: queueAssignmentRouter,
  batchExport: batchExportRouter,
  traces: traceRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  events: eventsRouter,
  scores: scoresRouter,
  scoreAnalytics: scoreAnalyticsRouter,
  scoreConfigs: scoreConfigsRouter,
  dashboard: dashboardRouter,
  organizations: organizationsRouter,
  organizationUsage: organizationUsageRouter,
  organizationApiKeys: organizationApiKeysRouter,
  verifiedDomain: verifiedDomainRouter,
  ssoConfig: ssoConfigRouter,
  projects: projectsRouter,
  users: userRouter,
  userAccount: userAccountRouter,
  projectApiKeys: projectApiKeysRouter,
  members: membersRouter,
  datasets: datasetRouter,
  cloudBilling: cloudBillingRouter,
  spendAlerts: spendAlertRouter,
  observations: observationsRouter,
  prompts: promptRouter,
  models: modelRouter,
  evals: evalRouter,
  evalsV2: evaluatorRouter,
  defaultLlmModel: defaultEvalModelRouter,
  experiments: experimentsRouter,
  posthogIntegration: posthogIntegrationRouter,
  mixpanelIntegration: mixpanelIntegrationRouter,
  blobStorageIntegration: blobStorageIntegrationRouter,
  externalMediaStorage: externalMediaStorageRouter,
  llmApiKey: llmApiKeyRouter,
  organizationLlmApiKey: organizationLlmApiKeyRouter,
  llmSchemas: llmSchemaRouter,
  llmTools: llmToolRouter,
  public: publicRouter,
  credentials: credentialsRouter,
  utilities: utilsRouter,
  uiCustomization: uiCustomizationRouter,
  comments: commentsRouter,
  commentReactions: commentReactionsRouter,
  media: mediaRouter,
  backgroundMigrations: backgroundMigrationsRouter,
  auditLogs: auditLogsRouter,
  table: tableRouter,
  batchAction: batchActionRouter,
  cloudStatus: cloudStatusRouter,
  dashboardWidgets: dashboardWidgetRouter,
  TableViewPresets: TableViewPresetsRouter,
  automations: automationsRouter,
  monitors: monitorsRouter,
  slack: slackRouter,
  supportRouter: supportRouter,
  onboarding: onboardingRouter,
  naturalLanguageFilters: naturalLanguageFilterRouter,
  searchBar: searchBarRouter,
  notificationPreferences: notificationPreferencesRouter,
  webCallouts: webCalloutsRouter,
  inAppAgent: inAppAgentRouter,
  v4Transition: v4TransitionRouter,
  aiGateway: aiGatewayRouter,
  skills: skillRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
