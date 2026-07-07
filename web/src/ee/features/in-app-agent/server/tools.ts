import { createTool } from "@mastra/core/tools";
import type { ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { assertUnreachable } from "@/src/utils/types";
import {
  buildDashboardsPath,
  buildDashboardWidgetPath,
  buildDatasetsPath,
  buildEvalsPath,
  buildExperimentsPath,
  buildModelsPath,
  buildMonitorsPath,
  buildPlaygroundPath,
  buildProjectMembersPath,
  buildProjectSettingsPath,
  buildPromptsPath,
  buildScoresPath,
  buildSessionPath,
  buildSessionsPath,
  buildTracePath,
  buildTracesPath,
} from "@/src/utils/product-url";
import z from "zod";
import { TABLE_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";
import { ObservationLevelDomain, TracingSearchType } from "@langfuse/shared";
import { Role } from "@langfuse/shared/src/db";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import type { McpToolName } from "@/src/features/mcp/server/bootstrap";

type InAppAgentMcpToolApproval = "auto" | "approval";

export type InAppAgentUserAccess = {
  projectRole?: Role;
  // Global Langfuse admin flag. This bypasses project membership checks.
  isAdmin: boolean;
};

type InAppAgentMcpToolPolicy = {
  approval: InAppAgentMcpToolApproval;
  availability: {
    scope: ProjectScope;
  };
};

// Exhaustive approval policy for Langfuse MCP tools. Keys use the unprefixed
// MCP registry names; tests compare this map with toolRegistry so new MCP tools
// must be classified before the in-app agent can auto/approval-gate them.
export const IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES: Record<
  McpToolName,
  InAppAgentMcpToolPolicy
> = {
  listAnnotationQueues: {
    approval: "auto",
    availability: { scope: "annotationQueues:read" },
  },
  createAnnotationQueue: {
    approval: "approval",
    availability: { scope: "annotationQueues:CUD" },
  },
  getAnnotationQueue: {
    approval: "auto",
    availability: { scope: "annotationQueues:read" },
  },
  listAnnotationQueueItems: {
    approval: "auto",
    availability: { scope: "annotationQueues:read" },
  },
  getAnnotationQueueItem: {
    approval: "auto",
    availability: { scope: "annotationQueues:read" },
  },
  createAnnotationQueueItem: {
    approval: "approval",
    availability: { scope: "annotationQueues:CUD" },
  },
  updateAnnotationQueueItem: {
    approval: "approval",
    availability: { scope: "annotationQueues:CUD" },
  },
  deleteAnnotationQueueItem: {
    approval: "approval",
    availability: { scope: "annotationQueues:CUD" },
  },
  createAnnotationQueueAssignment: {
    approval: "approval",
    availability: { scope: "annotationQueueAssignments:CUD" },
  },
  deleteAnnotationQueueAssignment: {
    approval: "approval",
    availability: { scope: "annotationQueueAssignments:CUD" },
  },
  createComment: {
    approval: "approval",
    availability: { scope: "comments:CUD" },
  },
  listComments: {
    approval: "auto",
    availability: { scope: "comments:read" },
  },
  getComment: {
    approval: "auto",
    availability: { scope: "comments:read" },
  },
  upsertDataset: {
    approval: "approval",
    availability: { scope: "datasets:CUD" },
  },
  listDatasets: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  getDataset: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  upsertDatasetItem: {
    approval: "approval",
    availability: { scope: "datasets:CUD" },
  },
  listDatasetItems: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  getDatasetItem: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  deleteDatasetItem: {
    approval: "approval",
    availability: { scope: "datasets:CUD" },
  },
  createDatasetRunItem: {
    approval: "approval",
    availability: { scope: "datasets:CUD" },
  },
  listDatasetRunItems: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  listDatasetRuns: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  getDatasetRun: {
    approval: "auto",
    availability: { scope: "datasets:read" },
  },
  deleteDatasetRun: {
    approval: "approval",
    availability: { scope: "datasets:CUD" },
  },
  listEvaluators: {
    approval: "auto",
    availability: { scope: "evalTemplate:read" },
  },
  getEvaluator: {
    approval: "auto",
    availability: { scope: "evalTemplate:read" },
  },
  upsertEvaluator: {
    approval: "approval",
    availability: { scope: "evalTemplate:CUD" },
  },
  deleteEvaluator: {
    approval: "approval",
    availability: { scope: "evalTemplate:CUD" },
  },
  listEvaluationRules: {
    approval: "auto",
    availability: { scope: "evalJob:read" },
  },
  getEvaluationRule: {
    approval: "auto",
    availability: { scope: "evalJob:read" },
  },
  createEvaluationRule: {
    approval: "approval",
    availability: { scope: "evalJob:CUD" },
  },
  updateEvaluationRule: {
    approval: "approval",
    availability: { scope: "evalJob:CUD" },
  },
  deleteEvaluationRule: {
    approval: "approval",
    availability: { scope: "evalJob:CUD" },
  },
  getHealth: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getMedia: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  queryMetrics: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getMetricsSchema: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  listModels: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  createModel: {
    approval: "approval",
    availability: { scope: "models:CUD" },
  },
  getModel: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  deleteModel: {
    approval: "approval",
    availability: { scope: "models:CUD" },
  },
  listObservations: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getObservation: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getObservationFieldSchema: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getObservationFilterSchema: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getObservationFilterValues: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getPrompt: {
    approval: "auto",
    availability: { scope: "prompts:read" },
  },
  getPromptUnresolved: {
    approval: "auto",
    availability: { scope: "prompts:read" },
  },
  listPrompts: {
    approval: "auto",
    availability: { scope: "prompts:read" },
  },
  createTextPrompt: {
    approval: "approval",
    availability: { scope: "prompts:CUD" },
  },
  createChatPrompt: {
    approval: "approval",
    availability: { scope: "prompts:CUD" },
  },
  updatePromptLabels: {
    approval: "approval",
    availability: { scope: "prompts:CUD" },
  },
  listScores: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  getScore: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
  createScore: {
    approval: "approval",
    availability: { scope: "scores:CUD" },
  },
  listScoreConfigs: {
    approval: "auto",
    availability: { scope: "scoreConfigs:read" },
  },
  getScoreConfig: {
    approval: "auto",
    availability: { scope: "scoreConfigs:read" },
  },
  createScoreConfig: {
    approval: "approval",
    availability: { scope: "scoreConfigs:CUD" },
  },
  updateScoreConfig: {
    approval: "approval",
    availability: { scope: "scoreConfigs:CUD" },
  },
  deleteScoreConfig: {
    approval: "approval",
    availability: { scope: "scoreConfigs:CUD" },
  },
  createDashboardWidget: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
};

export const IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES = new Set<McpToolName>(
  Object.keys(IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES) as McpToolName[],
);

export const IN_APP_AGENT_AUTO_APPROVED_EXTERNAL_TOOL_NAMES = new Set([
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
]);

// Tools in this set can run without a human-in-the-loop approval prompt. Every
// other MCP tool is still exposed to the model, but Mastra suspends execution
// until the user explicitly approves the exact call.
export const IN_APP_AGENT_AUTO_APPROVED_TOOL_NAMES = new Set([
  ...Object.entries(IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES)
    .filter(([, policy]) => policy.approval === "auto")
    .map(([toolName]) => `langfuse_${toolName}`),
  ...IN_APP_AGENT_AUTO_APPROVED_EXTERNAL_TOOL_NAMES,
]);

export function isMcpToolName(input: string): input is McpToolName {
  return IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES.has(input as McpToolName);
}

export function isInAppAgentLangfuseMcpToolAvailable(params: {
  toolName: McpToolName;
  userAccess?: InAppAgentUserAccess;
}): boolean {
  if (!params.userAccess) {
    return false;
  }

  const policy = IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES[params.toolName];

  if (!policy) {
    return false;
  }

  return hasProjectAccess({
    role: params.userAccess.projectRole ?? Role.MEMBER,
    admin: params.userAccess.isAdmin,
    scope: policy.availability.scope,
  });
}

export function filterInAppAgentAvailableLangfuseMcpTools<TTool>(params: {
  tools: Partial<Record<McpToolName, TTool>> | undefined;
  userAccess?: InAppAgentUserAccess;
}): Partial<Record<McpToolName, TTool>> {
  return Object.fromEntries(
    Object.entries(params.tools ?? {}).flatMap(([toolName, tool]) => {
      if (!isMcpToolName(toolName)) {
        return [];
      }

      if (
        !isInAppAgentLangfuseMcpToolAvailable({
          toolName,
          userAccess: params.userAccess,
        })
      ) {
        return [];
      }

      return [[toolName, tool] as const];
    }),
  );
}

type InAppAgentTool = object;

export function withInAppAgentToolApproval<TTool extends InAppAgentTool>(
  tools: Record<string, TTool>,
): Record<string, TTool | (TTool & { requireApproval: true })> {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => [
      toolName,
      isInAppAgentAutoApprovedToolName(toolName)
        ? tool
        : { ...tool, requireApproval: true },
    ]),
  ) as Record<string, TTool | (TTool & { requireApproval: true })>;
}

function isInAppAgentAutoApprovedToolName(toolName: string): boolean {
  return (
    toolName.startsWith("langfuseDocs_") ||
    IN_APP_AGENT_AUTO_APPROVED_TOOL_NAMES.has(toolName)
  );
}

const InAppAgentRedirectDestinationSchema = z.enum([
  "dashboardWidget",
  "dashboards",
  "datasets",
  "evals",
  "experiments",
  "models",
  "monitors",
  "playground",
  "projectMembers",
  "projectSettings",
  "prompts",
  "scores",
  "session",
  "sessions",
  "trace",
  "traces",
]);

const InAppAgentRedirectBaseSchema = z.object({
  label: z.string().min(1).max(80),
});

const InAppAgentTableTimeRangePresetSchema = z.enum(TABLE_AGGREGATION_OPTIONS);

const InAppAgentTableTimeRangeStrictSchema = z.union([
  z.object({
    preset: InAppAgentTableTimeRangePresetSchema,
  }),
  z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
]);

const InAppAgentTableTimeRangeSchema = z
  .object({
    preset: InAppAgentTableTimeRangePresetSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (!InAppAgentTableTimeRangeStrictSchema.safeParse(value).success) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either a preset or both from and to.",
      });
    }
  }) as z.ZodType<z.infer<typeof InAppAgentTableTimeRangeStrictSchema>>;

const InAppAgentTracingFiltersSchema = z.object({
  bookmarked: z.boolean().optional(),
  environment: z.array(z.string().min(1).max(100)).max(10).optional(),
  level: z.array(ObservationLevelDomain).max(4).optional(),
  metadata: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().max(200),
      }),
    )
    .max(5)
    .optional(),
  sessionId: z.array(z.string().min(1).max(200)).max(10).optional(),
  tags: z.array(z.string().min(1).max(100)).max(10).optional(),
  traceId: z.string().min(1).max(200).optional(),
  traceName: z.array(z.string().min(1).max(200)).max(10).optional(),
  userId: z.array(z.string().min(1).max(200)).max(10).optional(),
  version: z.string().min(1).max(200).optional(),
});

const InAppAgentTracesParamsSchema = z.object({
  filters: InAppAgentTracingFiltersSchema.optional(),
  orderBy: z
    .object({
      column: z.enum(["timestamp", "startTime", "traceName", "latency"]),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
  search: z
    .object({
      query: z.string().min(1).max(300),
      type: z.array(TracingSearchType).max(4).optional(),
    })
    .optional(),
  timeRange: InAppAgentTableTimeRangeSchema.optional(),
});

const InAppAgentProjectSettingsPageSchema = z.enum([
  "index",
  "api-keys",
  "developer-tools",
  "llm-connections",
  "models",
  "scores",
  "members",
  "integrations",
  "exports",
  "batch-actions",
  "audit-logs",
  "notifications",
]);

const InAppAgentRedirectToolInputStrictSchema = z.discriminatedUnion(
  "destination",
  [
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("dashboardWidget"),
      params: z.object({ widgetId: z.string().min(1).max(200) }),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("dashboards"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("datasets"),
      params: z
        .object({ folder: z.string().min(1).max(200).optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("evals") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("experiments"),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("models") }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("monitors") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("playground"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("projectMembers"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("projectSettings"),
      params: z
        .object({ page: InAppAgentProjectSettingsPageSchema.optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("prompts"),
      params: z
        .object({ folder: z.string().min(1).max(200).optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("scores") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("session"),
      params: z.object({ sessionId: z.string().min(1).max(200) }),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("sessions") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("trace"),
      params: z.object({
        timestamp: z.iso.datetime().optional(),
        traceId: z.string().min(1).max(200),
      }),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("traces"),
      params: InAppAgentTracesParamsSchema.optional(),
    }),
  ],
);

const InAppAgentRedirectParamsSchema = z.object({
  folder: z.string().min(1).max(200).optional(),
  page: InAppAgentProjectSettingsPageSchema.optional(),
  sessionId: z.string().min(1).max(200).optional(),
  timestamp: z.iso.datetime().optional(),
  traceId: z.string().min(1).max(200).optional(),
  widgetId: z.string().min(1).max(200).optional(),
  filters: InAppAgentTracingFiltersSchema.optional(),
  orderBy: InAppAgentTracesParamsSchema.shape.orderBy,
  search: InAppAgentTracesParamsSchema.shape.search,
  timeRange: InAppAgentTableTimeRangeSchema.optional(),
});

const InAppAgentRedirectToolInputSchema = InAppAgentRedirectBaseSchema.extend({
  destination: InAppAgentRedirectDestinationSchema,
  params: InAppAgentRedirectParamsSchema.optional(),
}).superRefine((value, ctx) => {
  const result = InAppAgentRedirectToolInputStrictSchema.safeParse(value);

  if (!result.success) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid redirect destination parameters.",
    });
  }
}) as z.ZodType<z.infer<typeof InAppAgentRedirectToolInputStrictSchema>>;

type InAppAgentRedirectToolInput = z.infer<
  typeof InAppAgentRedirectToolInputStrictSchema
>;

export function createRedirectActionTool({
  projectId,
  isV4Enabled,
}: {
  projectId: string;
  isV4Enabled: boolean;
}) {
  return createTool({
    id: IN_APP_AGENT_REDIRECT_TOOL_NAME,
    description:
      "Propose a user-confirmed navigation action to a known Langfuse page. This does not navigate automatically.",
    inputSchema: InAppAgentRedirectToolInputSchema,
    execute: async (input) => {
      return getRedirectActionToolResult({
        input,
        projectId,
        isV4Enabled,
      });
    },
  });
}

function getRedirectActionToolResult({
  input,
  projectId,
  isV4Enabled,
}: {
  input: unknown;
  projectId: string;
  isV4Enabled: boolean;
}) {
  const parsedInput = InAppAgentRedirectToolInputSchema.parse(input);
  const href = getRedirectHref(parsedInput, projectId, isV4Enabled);

  return {
    type: "redirectAction" as const,
    label: parsedInput.label,
    href,
  };
}

function getRedirectHref(
  input: InAppAgentRedirectToolInput,
  projectId: string,
  isV4Enabled: boolean,
): string {
  if (input.destination === "dashboardWidget") {
    return buildDashboardWidgetPath({
      projectId,
      widgetId: input.params.widgetId,
    });
  }

  if (input.destination === "dashboards") {
    return buildDashboardsPath({ projectId });
  }

  if (input.destination === "datasets") {
    return buildDatasetsPath({
      projectId,
      folder: input.params?.folder,
    });
  }

  if (input.destination === "evals") {
    return buildEvalsPath({ projectId });
  }

  if (input.destination === "experiments") {
    return buildExperimentsPath({ projectId });
  }

  if (input.destination === "models") {
    return buildModelsPath({ projectId });
  }

  if (input.destination === "monitors") {
    return buildMonitorsPath({ projectId });
  }

  if (input.destination === "playground") {
    return buildPlaygroundPath({ projectId });
  }

  if (input.destination === "projectMembers") {
    return buildProjectMembersPath({ projectId });
  }

  if (input.destination === "projectSettings") {
    return buildProjectSettingsPath({
      projectId,
      page: input.params?.page,
    });
  }

  if (input.destination === "prompts") {
    return buildPromptsPath({
      projectId,
      folder: input.params?.folder,
    });
  }

  if (input.destination === "scores") {
    return buildScoresPath({ projectId });
  }

  if (input.destination === "session") {
    return buildSessionPath({
      projectId,
      sessionId: input.params.sessionId,
    });
  }

  if (input.destination === "sessions") {
    return buildSessionsPath({ projectId });
  }

  if (input.destination === "trace") {
    return buildTracePath({
      projectId,
      traceId: input.params.traceId,
      timestamp: input.params.timestamp,
    });
  }

  if (input.destination === "traces") {
    return buildTracesPath({
      projectId,
      isV4Enabled,
      params: input.params,
    });
  }

  return assertUnreachable(input);
}
