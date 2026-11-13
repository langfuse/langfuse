import { EventType } from "@ag-ui/core";
import { Processor } from "bullmq";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { DashboardWidgetChartType } from "@prisma/client";
import pLimit from "p-limit";
import {
  DEFAULT_STARTER_PROJECT_NAME,
  EventActionSchema,
  isDefaultStarterOrganizationName,
  isStarterOrganizationMetadata,
  PRODUCTION_LABEL,
  ProjectNotificationEventTypeSchema,
  SKILL_PRODUCTION_LABEL,
  supportedModels,
  TriggerEventSourceSchema,
} from "@langfuse/shared";
import {
  logger,
  StorageServiceFactory,
  storageKeys,
  type StorageService,
} from "@langfuse/shared/src/server";
import { metricAggregations, viewDeclarations } from "@langfuse/shared/query";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

const CORE_DATA_EXPORT_PAGE_SIZE = 1_000;
const CORE_DATA_EXPORT_PART_SIZE_BYTES = 100 * 1024 * 1024;
// Each table export holds at most one postgres connection at a time (short
// keyset page queries). Keep this below the worker's Prisma pool size
// (default: 5 connections) so other queue jobs on the same worker never
// starve on connection acquisition.
const CORE_DATA_EXPORT_TABLE_CONCURRENCY = 3;

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      credentials: storageKeys(
        env.LANGFUSE_S3_CORE_DATA_UPLOAD_ACCESS_KEY_ID,
        env.LANGFUSE_S3_CORE_DATA_UPLOAD_SECRET_ACCESS_KEY,
      ),
      endpoint: env.LANGFUSE_S3_CORE_DATA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_CORE_DATA_UPLOAD_REGION,
      forcePathStyle:
        env.LANGFUSE_S3_CORE_DATA_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_CORE_DATA_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_CORE_DATA_UPLOAD_SSE_KMS_KEY_ID,
    });
  }
  return s3StorageServiceClient;
};

type UserCoreDataInput = {
  password: string | null;
  accounts: { provider: string }[];
} & Record<string, unknown>;

// Derives the auth methods per user from the linked next-auth accounts and the
// presence of a password hash ("credentials"). The hash itself must never
// reach the export.
export const mapUserToCoreDataRow = ({
  password,
  accounts,
  ...user
}: UserCoreDataInput) => ({
  ...user,
  authMethods: [
    ...(password ? ["credentials"] : []),
    ...Array.from(new Set(accounts.map((account) => account.provider))),
  ],
});

type JobConfigurationCoreDataInput = {
  evalTemplate: { name: string } | null;
  sampling: { toNumber: () => number };
  variableMapping?: unknown;
} & Record<string, unknown>;

// Airbyte's JSONL schema inference cannot merge null with array for one column.
// Empty mappings are exported as [] so every row has an array.
const variableMappingForExport = (variableMapping: unknown) =>
  variableMapping == null ? [] : variableMapping;

export const mapJobConfigurationToCoreDataRow = ({
  evalTemplate,
  sampling,
  variableMapping,
  ...jobConfiguration
}: JobConfigurationCoreDataInput) => ({
  ...jobConfiguration,
  variableMapping: variableMappingForExport(variableMapping),
  sampling: sampling.toNumber(),
  evalTemplateName: evalTemplate?.name ?? null,
});

type EvaluationRuleCoreDataInput = {
  sampling: { toNumber: () => number };
} & Record<string, unknown>;

export const mapEvaluationRuleToCoreDataRow = ({
  sampling,
  ...evaluationRule
}: EvaluationRuleCoreDataInput) => ({
  ...evaluationRule,
  sampling: sampling.toNumber(),
});

type EvaluatorVersionCoreDataInput = {
  variableMapping: unknown;
} & Record<string, unknown>;

export const mapEvaluatorVersionToCoreDataRow = ({
  variableMapping,
  ...version
}: EvaluatorVersionCoreDataInput) => ({
  ...version,
  variableMapping: variableMappingForExport(variableMapping),
});

type EvaluationRuleEvaluatorAssignmentCoreDataInput = {
  variableMapping: unknown;
} & Record<string, unknown>;

export const mapEvaluationRuleEvaluatorAssignmentToCoreDataRow = ({
  variableMapping,
  ...assignment
}: EvaluationRuleEvaluatorAssignmentCoreDataInput) => ({
  ...assignment,
  variableMapping: variableMappingForExport(variableMapping),
});

// Widget dimensions/metrics/chart config are persisted as free-form strings
// (DimensionSchema/MetricSchema accept any z.string()), so an API client can
// smuggle arbitrary text into them. The export therefore allowlists every
// string against the query-model declarations and replaces unknown values
// with a sentinel instead of forwarding them.
const KNOWN_WIDGET_MEASURES = new Set(
  Object.values(viewDeclarations).flatMap((versionViews) =>
    Object.values(versionViews).flatMap((view) => Object.keys(view.measures)),
  ),
);
const KNOWN_WIDGET_DIMENSIONS = new Set(
  Object.values(viewDeclarations).flatMap((versionViews) =>
    Object.values(versionViews).flatMap((view) => Object.keys(view.dimensions)),
  ),
);
const KNOWN_WIDGET_AGGREGATIONS = new Set<string>(metricAggregations.options);
const KNOWN_WIDGET_CHART_TYPES = new Set<string>(
  Object.values(DashboardWidgetChartType),
);
const INVALID_SENTINEL = "__invalid__";

const allowlisted = (value: unknown, allowlist: Set<string>): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && allowlist.has(value)) {
    return value;
  }
  return INVALID_SENTINEL;
};

type DashboardWidgetCoreDataInput = {
  dimensions: unknown;
  metrics: unknown;
  chartConfig: unknown;
  /** Drops a supplied filters column so it cannot leak through the rest spread. */
  filters?: unknown;
} & Record<string, unknown>;

/** Allowlists widget dimensions, metrics, and chart type, and keeps numeric chartConfig limits. */
export const mapDashboardWidgetToCoreDataRow = ({
  dimensions,
  metrics,
  filters: _filters,
  chartConfig,
  ...widget
}: DashboardWidgetCoreDataInput) => {
  const config = (chartConfig ?? {}) as Record<string, unknown>;
  return {
    ...widget,
    dimensions: Array.isArray(dimensions)
      ? dimensions.map((dimension: Record<string, unknown>) => ({
          field: allowlisted(dimension.field, KNOWN_WIDGET_DIMENSIONS),
        }))
      : [],
    metrics: Array.isArray(metrics)
      ? metrics.map((metric: Record<string, unknown>) => ({
          measure: allowlisted(metric.measure, KNOWN_WIDGET_MEASURES),
          agg: allowlisted(metric.agg, KNOWN_WIDGET_AGGREGATIONS),
        }))
      : [],
    chartConfig: {
      type: allowlisted(config.type, KNOWN_WIDGET_CHART_TYPES),
      row_limit: typeof config.row_limit === "number" ? config.row_limit : null,
      bins: typeof config.bins === "number" ? config.bins : null,
    },
  };
};

type DashboardCoreDataInput = {
  definition: unknown;
} & Record<string, unknown>;

// Dashboard definitions hold widget placements; explicit field picks keep any
// unexpected persisted keys out of the export.
export const mapDashboardToCoreDataRow = ({
  definition,
  ...dashboard
}: DashboardCoreDataInput) => {
  const widgets = (definition as { widgets?: unknown })?.widgets;
  return {
    ...dashboard,
    definition: {
      widgets: Array.isArray(widgets)
        ? widgets.map((placement: Record<string, unknown>) => ({
            type: placement.type ?? null,
            widgetId: placement.widgetId ?? null,
            x: placement.x ?? null,
            y: placement.y ?? null,
            x_size: placement.x_size ?? null,
            y_size: placement.y_size ?? null,
          }))
        : [],
    },
  };
};

const countLabels = (labels: string[], productionLabel: string) => ({
  labelCount: labels.length,
  hasProductionLabel: labels.includes(productionLabel),
});

/** Keeps a name only on rows Langfuse owns, which have no project. */
const langfuseOwnedName = (projectId: string | null, name: string) =>
  projectId === null ? name : null;

type OrganizationCoreDataInput = {
  name: string;
  metadata: unknown;
} & Record<string, unknown>;

/** Reads the starter flag from metadata, which is customer-writable through the admin API and never exported. */
export const mapOrganizationToCoreDataRow = ({
  metadata,
  ...organization
}: OrganizationCoreDataInput) => ({
  ...organization,
  isStarterOrganization: isStarterOrganizationMetadata(metadata),
  hasDefaultName: isDefaultStarterOrganizationName(organization.name),
});

type ProjectCoreDataInput = {
  name: string;
  homeDashboardId: string | null;
} & Record<string, unknown>;

export const mapProjectToCoreDataRow = ({
  homeDashboardId,
  ...project
}: ProjectCoreDataInput) => ({
  ...project,
  hasCustomHomeDashboard: homeDashboardId !== null,
  hasDefaultName: project.name === DEFAULT_STARTER_PROJECT_NAME,
});

type PromptCoreDataInput = { labels: string[] } & Record<string, unknown>;

export const mapPromptToCoreDataRow = ({
  labels,
  ...prompt
}: PromptCoreDataInput) => ({
  ...prompt,
  ...countLabels(labels, PRODUCTION_LABEL),
});

type SkillCoreDataInput = {
  labels: string[];
  tags: string[];
} & Record<string, unknown>;

export const mapSkillToCoreDataRow = ({
  labels,
  tags,
  ...skill
}: SkillCoreDataInput) => ({
  ...skill,
  ...countLabels(labels, SKILL_PRODUCTION_LABEL),
  tagCount: tags.length,
});

type PromptProtectedLabelCoreDataInput = { label: string } & Record<
  string,
  unknown
>;

export const mapPromptProtectedLabelToCoreDataRow = ({
  label,
  ...protectedLabel
}: PromptProtectedLabelCoreDataInput) => ({
  ...protectedLabel,
  isProduction: label === PRODUCTION_LABEL,
});

const KNOWN_TRIGGER_EVENT_SOURCES = new Set<string>(
  TriggerEventSourceSchema.options,
);
const KNOWN_TRIGGER_EVENT_ACTIONS = new Set<string>([
  ...EventActionSchema.options,
  ...ProjectNotificationEventTypeSchema.options,
]);

type TriggerCoreDataInput = {
  eventSource: string;
  eventActions: string[];
} & Record<string, unknown>;

/** The automations API stores any string as source and action, so both are allowlisted. */
export const mapTriggerToCoreDataRow = ({
  eventSource,
  eventActions,
  ...trigger
}: TriggerCoreDataInput) => ({
  ...trigger,
  eventSource: allowlisted(eventSource, KNOWN_TRIGGER_EVENT_SOURCES),
  eventActions: eventActions.map((eventAction) =>
    allowlisted(eventAction, KNOWN_TRIGGER_EVENT_ACTIONS),
  ),
});

type GatewayAiConnectionCoreDataInput = {
  allowedModels: unknown;
  customModels: unknown;
} & Record<string, unknown>;

/** A null allowedModels allows every model, so its count stays null. */
export const mapGatewayAiConnectionToCoreDataRow = ({
  allowedModels,
  customModels,
  ...connection
}: GatewayAiConnectionCoreDataInput) => ({
  ...connection,
  allowedModelCount: Array.isArray(allowedModels) ? allowedModels.length : null,
  customModelCount: Array.isArray(customModels) ? customModels.length : 0,
});

type InAppAgentConversationCoreDataInput = {
  alwaysAllowedTools: string[];
} & Record<string, unknown>;

const mapInAppAgentConversationToCoreDataRow = ({
  alwaysAllowedTools,
  ...conversation
}: InAppAgentConversationCoreDataInput) => ({
  ...conversation,
  alwaysAllowedToolCount: alwaysAllowedTools.length,
});

type InAppAgentRunCoreDataInput = {
  _count: { events: number };
} & Record<string, unknown>;

/** Exports the count of a run's finished text messages instead of the per-event table. */
export const mapInAppAgentRunToCoreDataRow = ({
  _count,
  ...run
}: InAppAgentRunCoreDataInput) => ({
  ...run,
  textMessageEndCount: _count.events,
});

const KNOWN_SUPPORTED_MODELS = new Set<string>(
  Object.values(supportedModels).flat(),
);

type TopicConfigCoreDataInput = {
  summaryModel: string | null;
  embeddingModel: string | null;
  clusteringModel: string | null;
} & Record<string, unknown>;

/** Topics accepts any model name, including a connection's custom models, so names are allowlisted. */
export const mapTopicConfigToCoreDataRow = ({
  summaryModel,
  embeddingModel,
  clusteringModel,
  ...topicConfig
}: TopicConfigCoreDataInput) => ({
  ...topicConfig,
  summaryModel: allowlisted(summaryModel, KNOWN_SUPPORTED_MODELS),
  embeddingModel: allowlisted(embeddingModel, KNOWN_SUPPORTED_MODELS),
  clusteringModel: allowlisted(clusteringModel, KNOWN_SUPPORTED_MODELS),
});

type TopicClusteringRunCoreDataInput = {
  topicVersionIds: string[];
} & Record<string, unknown>;

const mapTopicClusteringRunToCoreDataRow = ({
  topicVersionIds,
  ...run
}: TopicClusteringRunCoreDataInput) => ({
  ...run,
  topicVersionCount: topicVersionIds.length,
});

type AnnotationQueueCoreDataInput = {
  scoreConfigIds: string[];
} & Record<string, unknown>;

const mapAnnotationQueueToCoreDataRow = ({
  scoreConfigIds,
  ...queue
}: AnnotationQueueCoreDataInput) => ({
  ...queue,
  scoreConfigCount: scoreConfigIds.length,
});

type MonitorCoreDataInput = {
  windowMs: bigint;
  cadenceMs: bigint;
  triggerIds: string[];
} & Record<string, unknown>;

/** Exports the BigInt durations as numbers, since JSON.stringify throws on BigInt. */
export const mapMonitorToCoreDataRow = ({
  windowMs,
  cadenceMs,
  triggerIds,
  ...monitor
}: MonitorCoreDataInput) => ({
  ...monitor,
  windowMs: Number(windowMs),
  cadenceMs: Number(cadenceMs),
  triggerCount: triggerIds.length,
});

type DatasetCoreDataInput = {
  remoteExperimentUrl: string | null;
  inputSchema: unknown;
  expectedOutputSchema: unknown;
} & Record<string, unknown>;

export const mapDatasetToCoreDataRow = ({
  remoteExperimentUrl,
  inputSchema,
  expectedOutputSchema,
  ...dataset
}: DatasetCoreDataInput) => ({
  ...dataset,
  hasRemoteExperiment: Boolean(remoteExperimentUrl),
  hasInputSchema: inputSchema !== null,
  hasExpectedOutputSchema: expectedOutputSchema !== null,
});

type ScoreConfigCoreDataInput = { categories: unknown } & Record<
  string,
  unknown
>;

/** Counts categories only for categorical configs; others export null. */
export const mapScoreConfigToCoreDataRow = ({
  categories,
  ...scoreConfig
}: ScoreConfigCoreDataInput) => ({
  ...scoreConfig,
  categoryCount: Array.isArray(categories) ? categories.length : null,
});

type EvalTemplateCoreDataInput = {
  name: string;
  projectId: string | null;
} & Record<string, unknown>;

export const mapEvalTemplateToCoreDataRow = ({
  name,
  ...template
}: EvalTemplateCoreDataInput) => ({
  ...template,
  name: langfuseOwnedName(template.projectId, name),
});

type ModelCoreDataInput = {
  modelName: string;
  projectId: string | null;
  _count: { Price: number; pricingTiers: number };
} & Record<string, unknown>;

export const mapModelToCoreDataRow = ({
  modelName,
  _count,
  ...model
}: ModelCoreDataInput) => ({
  ...model,
  modelName: langfuseOwnedName(model.projectId, modelName),
  priceCount: _count.Price,
  tierCount: _count.pricingTiers,
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const emailDomain = (email: string) => {
  const normalized = normalizeEmail(email);
  return normalized.slice(normalized.lastIndexOf("@") + 1);
};

type MembershipInvitationCoreDataInput = {
  email: string;
  invitedByUser: { email: string | null } | null;
  organization: { verifiedDomains: { domain: string }[] };
} & Record<string, unknown>;

/** Exports a SHA-256 of the invitee's normalized email and two domain checks, never an email. */
export const mapMembershipInvitationToCoreDataRow = ({
  email,
  invitedByUser,
  organization,
  ...invitation
}: MembershipInvitationCoreDataInput) => {
  const inviteeDomain = emailDomain(email);
  const inviterEmail = invitedByUser?.email ?? null;

  return {
    ...invitation,
    emailHash: createHash("sha256").update(normalizeEmail(email)).digest("hex"),
    sameDomainAsInviter:
      inviterEmail === null
        ? null
        : emailDomain(inviterEmail) === inviteeDomain,
    domainIsVerifiedForOrg: organization.verifiedDomains.some(
      (verifiedDomain) => verifiedDomain.domain.toLowerCase() === inviteeDomain,
    ),
  };
};

type TablePageArgs<TCursor> = {
  lastRow: TCursor | null;
  take: number;
};

type FetchTablePage<TRow> = (args: {
  lastRow: TRow | null;
  take: number;
}) => Promise<TRow[]>;

async function* createTableJsonlStream<TRow>({
  fetchPage,
  mapRow,
  pageSize,
  onPage,
}: {
  fetchPage: FetchTablePage<TRow>;
  mapRow?: (row: TRow) => unknown;
  pageSize: number;
  onPage?: (pageRowCount: number) => void;
}): AsyncGenerator<string> {
  let lastRow: TRow | null = null;
  let isFirstRow = true;

  while (true) {
    const rows = await fetchPage({ lastRow, take: pageSize });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      yield `${isFirstRow ? "" : "\n"}${JSON.stringify(mapRow ? mapRow(row) : row)}`;
      isFirstRow = false;
    }

    onPage?.(rows.length);

    if (rows.length < pageSize) {
      break;
    }

    lastRow = rows[rows.length - 1];
  }
}

// Streams a table to S3 as JSONL via keyset pagination so memory usage stays
// O(page size) regardless of table size and no postgres connection is held
// across pages. `fetchPage` must return rows in a stable unique order,
// resuming strictly after `lastRow`.
export const uploadTableCoreDataJsonl = async <TRow>({
  s3Client,
  uploadPrefix,
  tableName,
  fetchPage,
  mapRow,
  pageSize = CORE_DATA_EXPORT_PAGE_SIZE,
}: {
  s3Client: StorageService;
  uploadPrefix: string;
  tableName: string;
  fetchPage: FetchTablePage<TRow>;
  mapRow?: (row: TRow) => unknown;
  pageSize?: number;
}): Promise<void> => {
  logger.info(`[CORE DATA] Exporting table ${tableName}`);

  let rowCount = 0;

  try {
    await s3Client.uploadFileBuffered({
      fileName: `${uploadPrefix}${tableName}.jsonl`,
      fileType: "application/x-ndjson",
      data: Readable.from(
        createTableJsonlStream({
          fetchPage,
          mapRow,
          pageSize,
          onPage: (pageRowCount) => {
            rowCount += pageRowCount;
          },
        }),
      ),
      partSizeBytes: CORE_DATA_EXPORT_PART_SIZE_BYTES,
    });
  } catch (error) {
    logger.error(
      `[CORE DATA] Export of table ${tableName} failed after ${rowCount} rows`,
      error,
    );
    throw error;
  }

  logger.info(`[CORE DATA] Finished table ${tableName} (${rowCount} rows)`);
};

// One entry per exported table. The tableName doubles as the S3 object base
// name — keep names stable, downstream DWH consumers depend on them.
export const coreDataTableExports: Array<
  (args: { s3Client: StorageService; uploadPrefix: string }) => Promise<void>
> = [
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "projects",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.project.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            orgId: true,
            deletedAt: true,
            retentionDays: true,
            hasTraces: true,
            homeDashboardId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapProjectToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "users",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.user.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            featureFlags: true,
            v4BetaEnabled: true,
            createdAt: true,
            updatedAt: true,
            // password and accounts are mapped to authMethods below and must
            // not be exported as-is
            password: true,
            accounts: {
              select: {
                provider: true,
              },
            },
          },
        }),
      mapRow: mapUserToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "organizations",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.organization.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            cloudConfig: true,
            sfdcOrgId: true,
            aiFeaturesEnabled: true,
            aiTelemetryEnabled: true,
            accessAuditLogEnabled: true,
            cloudFreeTierUsageThresholdState: true,
            featureFlagOrgDefaults: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapOrganizationToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "orgMemberships",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.organizationMembership.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            role: true,
            orgId: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "projectMemberships",
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ projectId: string; userId: string }>) =>
        prisma.projectMembership.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  projectId_userId: {
                    projectId: lastRow.projectId,
                    userId: lastRow.userId,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [{ projectId: "asc" }, { userId: "asc" }],
          select: {
            role: true,
            projectId: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "billingMeterBackup",
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{
        stripeCustomerId: string;
        meterId: string;
        startTime: Date;
        endTime: Date;
      }>) =>
        prisma.billingMeterBackup.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  stripeCustomerId_meterId_startTime_endTime: {
                    stripeCustomerId: lastRow.stripeCustomerId,
                    meterId: lastRow.meterId,
                    startTime: lastRow.startTime,
                    endTime: lastRow.endTime,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [
            { stripeCustomerId: "asc" },
            { meterId: "asc" },
            { startTime: "asc" },
            { endTime: "asc" },
          ],
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "surveys",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.survey.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            surveyName: true,
            response: true,
            userId: true,
            userEmail: true,
            orgId: true,
            createdAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "blobStorageIntegrations",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ projectId: string }>) =>
        prisma.blobStorageIntegration.findMany({
          take,
          ...(lastRow
            ? { cursor: { projectId: lastRow.projectId }, skip: 1 }
            : {}),
          orderBy: { projectId: "asc" },
          select: {
            projectId: true,
            type: true,
            bucketName: true,
            prefix: true,
            region: true,
            endpoint: true,
            forcePathStyle: true,
            nextSyncAt: true,
            lastSyncAt: true,
            enabled: true,
            exportFrequency: true,
            fileType: true,
            exportMode: true,
            exportStartDate: true,
            exportSource: true,
            exportFieldGroups: true,
            compressed: true,
            lastError: true,
            lastErrorAt: true,
            lastFailureNotificationSentAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "posthogIntegrations",
      // encryptedPosthogApiKey is excluded as it holds the project's API key
      fetchPage: ({ lastRow, take }: TablePageArgs<{ projectId: string }>) =>
        prisma.posthogIntegration.findMany({
          take,
          ...(lastRow
            ? { cursor: { projectId: lastRow.projectId }, skip: 1 }
            : {}),
          orderBy: { projectId: "asc" },
          select: {
            projectId: true,
            posthogHostName: true,
            lastSyncAt: true,
            enabled: true,
            exportSource: true,
            createdAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "mixpanelIntegrations",
      // encryptedMixpanelProjectToken is excluded as it holds the project token
      fetchPage: ({ lastRow, take }: TablePageArgs<{ projectId: string }>) =>
        prisma.mixpanelIntegration.findMany({
          take,
          ...(lastRow
            ? { cursor: { projectId: lastRow.projectId }, skip: 1 }
            : {}),
          orderBy: { projectId: "asc" },
          select: {
            projectId: true,
            mixpanelRegion: true,
            lastSyncAt: true,
            enabled: true,
            exportSource: true,
            createdAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "ssoConfigs",
      // authConfig is excluded as it may contain client secrets
      fetchPage: ({ lastRow, take }: TablePageArgs<{ domain: string }>) =>
        prisma.ssoConfig.findMany({
          take,
          ...(lastRow ? { cursor: { domain: lastRow.domain }, skip: 1 } : {}),
          orderBy: { domain: "asc" },
          select: {
            domain: true,
            authProvider: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "verifiedDomains",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.verifiedDomain.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            organizationId: true,
            domain: true,
            verifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "prompts",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.prompt.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            projectId: true,
            version: true,
            createdBy: true,
            labels: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapPromptToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "jobConfigurations",
      /** Omits the customer-authored job-configuration filter. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.jobConfiguration.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            jobType: true,
            status: true,
            blockedAt: true,
            blockReason: true,
            evalTemplateId: true,
            scoreName: true,
            targetObject: true,
            variableMapping: true,
            sampling: true,
            delay: true,
            timeScope: true,
            createdAt: true,
            updatedAt: true,
            evalTemplate: { select: { name: true } },
          },
        }),
      mapRow: mapJobConfigurationToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "evaluators",
      // Customer-authored descriptions and block messages are free text and
      // intentionally excluded from the core-data analytics export.
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.evaluator.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            name: true,
            type: true,
            createdByUserId: true,
            blockedAt: true,
            blockReason: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "evaluatorVersions",
      /** Exports version metadata, vars, and variableMapping, and omits prompt, code, and model params. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.evaluatorVersion.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            evaluatorId: true,
            version: true,
            createdByUserId: true,
            partner: true,
            model: true,
            provider: true,
            vars: true,
            variableMapping: true,
            sourceCodeLanguage: true,
            createdAt: true,
          },
        }),
      mapRow: mapEvaluatorVersionToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "evaluationRules",
      /** Omits the customer-authored evaluation-rule filter. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.evaluationRule.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            createdByUserId: true,
            name: true,
            status: true,
            targetObject: true,
            sampling: true,
            delay: true,
            timeScope: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapEvaluationRuleToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "evaluationRuleEvaluatorAssignments",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.evaluationRuleEvaluatorAssignment.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            evaluationRuleId: true,
            evaluatorId: true,
            variableMapping: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapEvaluationRuleEvaluatorAssignmentToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "dashboards",
      // Customer-authored name/description are free text and intentionally
      // excluded; the definition JSON holds only widget placements (ids,
      // positions, sizes). projectId NULL marks Langfuse-owned templates.
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.dashboard.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            createdBy: true,
            definition: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapDashboardToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "dashboardWidgets",
      /** Allowlists widget dimensions, metrics, and chart type, and omits customer-authored filters. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.dashboardWidget.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            createdBy: true,
            view: true,
            dimensions: true,
            metrics: true,
            chartType: true,
            chartConfig: true,
            minVersion: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapDashboardWidgetToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "apiKeys",
      /** Omits the note, the public key, the secret hashes and the displayed secret. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.apiKey.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            scope: true,
            projectId: true,
            orgId: true,
            userId: true,
            isInAppAgentKey: true,
            createdByUserId: true,
            createdByApiKeyId: true,
            lastUsedAt: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "llmApiKeys",
      /** Omits the keys, the base URL, headers, custom models, config and the customer-chosen provider name. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.llmApiKeys.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            organizationId: true,
            adapter: true,
            withDefaultModels: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "membershipInvitations",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.membershipInvitation.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            orgId: true,
            orgRole: true,
            projectId: true,
            projectRole: true,
            invitedByUserId: true,
            createdAt: true,
            updatedAt: true,
            // email and the inviter's email are mapped to a hash and domain checks below
            email: true,
            invitedByUser: { select: { email: true } },
            organization: {
              select: {
                verifiedDomains: {
                  where: { verifiedAt: { not: null } },
                  select: { domain: true },
                },
              },
            },
          },
        }),
      mapRow: mapMembershipInvitationToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "gatewayConfigs",
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ organizationId: string }>) =>
        prisma.gatewayConfig.findMany({
          take,
          ...(lastRow
            ? {
                cursor: { organizationId: lastRow.organizationId },
                skip: 1,
              }
            : {}),
          orderBy: { organizationId: "asc" },
          select: {
            organizationId: true,
            ingestionMode: true,
            defaultIngestionProjectId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "gatewayAiConnections",
      /** Omits the name, credentials, base URL, headers and config, and counts the model lists. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.gatewayAiConnection.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            organizationId: true,
            provider: true,
            status: true,
            createdById: true,
            allowedModels: true,
            customModels: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapGatewayAiConnectionToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "gatewayApiKeyAssociations",
      // The table has no timestamps; its metadata stays out.
      fetchPage: ({ lastRow, take }: TablePageArgs<{ apiKeyId: string }>) =>
        prisma.gatewayApiKeyAssociation.findMany({
          take,
          ...(lastRow
            ? { cursor: { apiKeyId: lastRow.apiKeyId }, skip: 1 }
            : {}),
          orderBy: { apiKeyId: "asc" },
          select: { apiKeyId: true },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "inAppAgentConversations",
      /** Omits the title, the provider session and the tool names. */
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ id: string; projectId: string }>) =>
        prisma.inAppAgentConversation.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  id_projectId: {
                    id: lastRow.id,
                    projectId: lastRow.projectId,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [{ id: "asc" }, { projectId: "asc" }],
          select: {
            id: true,
            projectId: true,
            createdByUserId: true,
            visibilityScope: true,
            alwaysAllowedTools: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapInAppAgentConversationToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "inAppAgentRuns",
      /** Omits the request, the error message and the MCP key. */
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ id: string; projectId: string }>) =>
        prisma.inAppAgentRun.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  id_projectId: {
                    id: lastRow.id,
                    projectId: lastRow.projectId,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [{ id: "asc" }, { projectId: "asc" }],
          select: {
            id: true,
            projectId: true,
            conversationId: true,
            triggeredByUserId: true,
            model: true,
            status: true,
            errorCode: true,
            finishedAt: true,
            cancelRequestedAt: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                events: { where: { type: EventType.TEXT_MESSAGE_END } },
              },
            },
          },
        }),
      mapRow: mapInAppAgentRunToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "skills",
      /** Omits the name, description, frontmatter, commit message and files, and counts labels and tags. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.skill.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            createdBy: true,
            version: true,
            labels: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapSkillToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "promptProtectedLabels",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.promptProtectedLabels.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            label: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapPromptProtectedLabelToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "topicConfigs",
      /** Omits the LLM connection ids and the block message, and allowlists the model names. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.topicConfig.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            createdBy: true,
            enabled: true,
            blockedAt: true,
            blockReason: true,
            summaryModel: true,
            embeddingModel: true,
            clusteringModel: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapTopicConfigToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "topicClusteringRuns",
      /** Omits the config and the error, and counts the topic versions. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.topicClusteringRun.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            facetId: true,
            facetVersion: true,
            status: true,
            ruleId: true,
            batchActionId: true,
            topicVersionIds: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
          },
        }),
      mapRow: mapTopicClusteringRunToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "batchActions",
      /** Omits the query, config and log. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.batchAction.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            actionType: true,
            tableName: true,
            status: true,
            totalCount: true,
            processedCount: true,
            failedCount: true,
            userId: true,
            finishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "annotationQueues",
      /** Omits the name and description, and counts the score configs. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.annotationQueue.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            scoreConfigIds: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapAnnotationQueueToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "annotationQueueAssignments",
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.annotationQueueAssignment.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            queueId: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "scoreConfigs",
      /** Omits the name, description, category labels and range, and counts the categories. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.scoreConfig.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            dataType: true,
            isArchived: true,
            categories: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapScoreConfigToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "evalTemplates",
      /** Omits the prompt, model, provider, params, variables, output schema and code; keeps names of Langfuse-managed templates only. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.evalTemplate.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            name: true,
            version: true,
            type: true,
            partner: true,
            sourceCodeLanguage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapEvalTemplateToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "monitors",
      /** Omits the name, tags, query, thresholds and notification settings. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.monitor.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            createdBy: true,
            updatedBy: true,
            view: true,
            windowMs: true,
            cadenceMs: true,
            thresholdOperator: true,
            severity: true,
            severityChangedAt: true,
            status: true,
            triggerIds: true,
            nextRunAt: true,
            lastCompletedAt: true,
            alertedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapMonitorToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "triggers",
      /** Omits the customer-authored filter and allowlists the event source and actions. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.trigger.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            eventSource: true,
            eventActions: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapTriggerToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "automations",
      /** Omits the name. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.automation.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            triggerId: true,
            actionId: true,
            createdAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "actions",
      /** Omits the config, which holds webhook URLs, headers and secrets. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.action.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            type: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "cloudSpendAlerts",
      /** Omits the title and the threshold. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.cloudSpendAlert.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            orgId: true,
            triggeredAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "datasets",
      /** Omits the name, description, metadata, schemas and remote experiment settings, and flags which are set. */
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ id: string; projectId: string }>) =>
        prisma.dataset.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  id_projectId: {
                    id: lastRow.id,
                    projectId: lastRow.projectId,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [{ id: "asc" }, { projectId: "asc" }],
          select: {
            id: true,
            projectId: true,
            remoteExperimentEnabled: true,
            remoteExperimentUrl: true,
            inputSchema: true,
            expectedOutputSchema: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      mapRow: mapDatasetToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "datasetRuns",
      /** Omits the name, description and metadata. */
      fetchPage: ({
        lastRow,
        take,
      }: TablePageArgs<{ id: string; projectId: string }>) =>
        prisma.datasetRuns.findMany({
          take,
          ...(lastRow
            ? {
                cursor: {
                  id_projectId: {
                    id: lastRow.id,
                    projectId: lastRow.projectId,
                  },
                },
                skip: 1,
              }
            : {}),
          orderBy: [{ id: "asc" }, { projectId: "asc" }],
          select: {
            id: true,
            projectId: true,
            datasetId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "tableViewPresets",
      /** Omits the name, filters, column settings, search query and sort. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.tableViewPreset.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            tableName: true,
            createdBy: true,
            updatedBy: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "batchExports",
      /** Omits the name, query, download URL and log. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.batchExport.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            userId: true,
            status: true,
            format: true,
            finishedAt: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "models",
      /** Omits the match pattern, tokenizer config, prices and tier conditions; keeps names of Langfuse's default models only. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.model.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            modelName: true,
            unit: true,
            tokenizerId: true,
            startDate: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { Price: true, pricingTiers: true } },
          },
        }),
      mapRow: mapModelToCoreDataRow,
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "externalMediaStorageIntegrations",
      /** Omits the bucket, prefix, endpoint, region, credentials, role and external id. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ projectId: string }>) =>
        prisma.externalMediaStorageIntegration.findMany({
          take,
          ...(lastRow
            ? { cursor: { projectId: lastRow.projectId }, skip: 1 }
            : {}),
          orderBy: { projectId: "asc" },
          select: {
            projectId: true,
            type: true,
            authType: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
  (args) =>
    uploadTableCoreDataJsonl({
      ...args,
      tableName: "webCalloutEndpoints",
      /** Omits the name, URL, toast text and headers. */
      fetchPage: ({ lastRow, take }: TablePageArgs<{ id: string }>) =>
        prisma.webCalloutEndpoint.findMany({
          take,
          ...(lastRow ? { cursor: { id: lastRow.id }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            projectId: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    }),
];

export const coreDataS3ExportProcessor: Processor = async (): Promise<void> => {
  if (!env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET) {
    logger.error("[CORE DATA] No bucket name provided for core data S3 export");
    throw new Error(
      "Must provide LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET to use core data S3 exports",
    );
  }

  logger.info("[CORE DATA] Starting core data S3 export");

  const s3Client = getS3StorageServiceClient(
    env.LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET,
  );
  const uploadPrefix = env.LANGFUSE_S3_CORE_DATA_UPLOAD_PREFIX;

  const limit = pLimit(CORE_DATA_EXPORT_TABLE_CONCURRENCY);
  const results = await Promise.allSettled(
    coreDataTableExports.map((exportTable) =>
      limit(() => exportTable({ s3Client, uploadPrefix })),
    ),
  );

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    logger.error(
      `[CORE DATA] Core data S3 export failed for ${failures.length} of ${results.length} tables`,
    );
    throw failures[0].reason;
  }

  logger.info("[CORE DATA] Finished core data S3 export");
};
