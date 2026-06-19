import { createTool } from "@mastra/core/tools";
import { assertUnreachable } from "@/src/utils/types";
import {
  buildDashboardsPath,
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
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import type { McpToolName } from "@/src/features/mcp/server/bootstrap";

type InAppAgentMcpToolApproval = "auto" | "approval";

// Exhaustive approval policy for Langfuse MCP tools. Keys use the unprefixed
// MCP registry names; tests compare this map with toolRegistry so new MCP tools
// must be classified before the in-app agent can auto/approval-gate them.
export const IN_APP_AGENT_LANGFUSE_MCP_TOOL_APPROVALS: Record<
  McpToolName,
  InAppAgentMcpToolApproval
> = {
  listAnnotationQueues: "auto",
  createAnnotationQueue: "approval",
  getAnnotationQueue: "auto",
  listAnnotationQueueItems: "auto",
  getAnnotationQueueItem: "auto",
  createAnnotationQueueItem: "approval",
  updateAnnotationQueueItem: "approval",
  deleteAnnotationQueueItem: "approval",
  createAnnotationQueueAssignment: "approval",
  deleteAnnotationQueueAssignment: "approval",
  createComment: "approval",
  listComments: "auto",
  getComment: "auto",
  upsertDataset: "approval",
  listDatasets: "auto",
  getDataset: "auto",
  upsertDatasetItem: "approval",
  listDatasetItems: "auto",
  getDatasetItem: "auto",
  deleteDatasetItem: "approval",
  createDatasetRunItem: "approval",
  listDatasetRunItems: "auto",
  listDatasetRuns: "auto",
  getDatasetRun: "auto",
  deleteDatasetRun: "approval",
  listEvaluators: "auto",
  getEvaluator: "auto",
  upsertEvaluator: "approval",
  deleteEvaluator: "approval",
  listEvaluationRules: "auto",
  getEvaluationRule: "auto",
  createEvaluationRule: "approval",
  updateEvaluationRule: "approval",
  deleteEvaluationRule: "approval",
  getHealth: "auto",
  getMedia: "auto",
  queryMetrics: "auto",
  getMetricsSchema: "auto",
  listModels: "auto",
  createModel: "approval",
  getModel: "auto",
  deleteModel: "approval",
  listObservations: "auto",
  getObservation: "auto",
  getObservationFieldSchema: "auto",
  getObservationFilterSchema: "auto",
  getObservationFilterValues: "auto",
  getPrompt: "auto",
  getPromptUnresolved: "auto",
  listPrompts: "auto",
  createTextPrompt: "approval",
  createChatPrompt: "approval",
  updatePromptLabels: "approval",
  listScores: "auto",
  getScore: "auto",
  createScore: "approval",
  listScoreConfigs: "auto",
  getScoreConfig: "auto",
  createScoreConfig: "approval",
  updateScoreConfig: "approval",
  deleteScoreConfig: "approval",
};

export const IN_APP_AGENT_AUTO_APPROVED_EXTERNAL_TOOL_NAMES = new Set([
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
]);

// Tools in this set can run without a human-in-the-loop approval prompt. Every
// other MCP tool is still exposed to the model, but Mastra suspends execution
// until the user explicitly approves the exact call.
export const IN_APP_AGENT_AUTO_APPROVED_TOOL_NAMES = new Set([
  ...Object.entries(IN_APP_AGENT_LANGFUSE_MCP_TOOL_APPROVALS)
    .filter(([, approval]) => approval === "auto")
    .map(([toolName]) => `langfuse_${toolName}`),
  ...IN_APP_AGENT_AUTO_APPROVED_EXTERNAL_TOOL_NAMES,
]);

type InAppAgentTool = object;

export function withInAppAgentToolApproval<TTool extends InAppAgentTool>(
  tools: Record<string, TTool>,
): Record<string, TTool | (TTool & { requireApproval: true })> {
  // Mastra's approval gate is the user-facing HITL boundary. The MCP run secret
  // is a separate server-side guard checked by the Langfuse MCP endpoint.
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
