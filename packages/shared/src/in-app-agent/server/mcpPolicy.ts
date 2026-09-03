import { EventType } from "@ag-ui/core";
import { z } from "zod";

import type { ProjectScope } from "../../features/rbac/projectAccessRights";
import { hasProjectAccessByRole } from "../../features/rbac/projectAccessRights";
import { Role } from "../../db";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "../constants";
import {
  buildInAppAgentToolApprovalEvent,
  type InAppAgentToolApprovalSource,
} from "../approvalEvents";
import type { AgUiCustomEvent, AgUiEvent } from "../schema";

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
// MCP registry names and are the source of truth for the tool-name type below.
// Exhaustiveness against web's MCP toolRegistry is enforced by type and runtime
// assertions in web's in-app-agent stream servertest, so new MCP tools must be
// classified before the in-app agent can auto/approval-gate them.
export const IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES = {
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
    availability: { scope: "evaluator:read" },
  },
  listManagedEvaluatorTemplates: {
    approval: "auto",
    availability: { scope: "evaluator:read" },
  },
  getEvaluator: {
    approval: "auto",
    availability: { scope: "evaluator:read" },
  },
  testEvaluator: {
    approval: "approval",
    availability: { scope: "evaluator:CUD" },
  },
  createEvaluator: {
    approval: "approval",
    availability: { scope: "evaluator:CUD" },
  },
  updateEvaluator: {
    approval: "approval",
    availability: { scope: "evaluator:CUD" },
  },
  deleteEvaluator: {
    approval: "approval",
    availability: { scope: "evaluator:CUD" },
  },
  listEvaluationRules: {
    approval: "auto",
    availability: { scope: "evaluationRule:read" },
  },
  getEvaluationRule: {
    approval: "auto",
    availability: { scope: "evaluationRule:read" },
  },
  createEvaluationRule: {
    approval: "approval",
    availability: { scope: "evaluationRule:CUD" },
  },
  updateEvaluationRule: {
    approval: "approval",
    availability: { scope: "evaluationRule:CUD" },
  },
  attachEvaluatorToEvaluationRule: {
    approval: "approval",
    availability: { scope: "evaluationRule:CUD" },
  },
  detachEvaluatorFromEvaluationRule: {
    approval: "approval",
    availability: { scope: "evaluationRule:CUD" },
  },
  deleteEvaluationRule: {
    approval: "approval",
    availability: { scope: "evaluationRule:CUD" },
  },
  listExperiments: {
    approval: "auto",
    availability: { scope: "promptExperiments:read" },
  },
  listExperimentItems: {
    approval: "auto",
    availability: { scope: "promptExperiments:read" },
  },
  submitFeedback: {
    approval: "approval",
    availability: { scope: "project:read" },
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
  listAlerts: {
    approval: "auto",
    availability: { scope: "alerts:read" },
  },
  getAlert: {
    approval: "auto",
    availability: { scope: "alerts:read" },
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
  listDashboardWidgets: {
    approval: "auto",
    availability: { scope: "dashboards:read" },
  },
  getDashboardWidget: {
    approval: "auto",
    availability: { scope: "dashboards:read" },
  },
  updateDashboardWidget: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  deleteDashboardWidget: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  listDashboards: {
    approval: "auto",
    availability: { scope: "dashboards:read" },
  },
  getDashboard: {
    approval: "auto",
    availability: { scope: "dashboards:read" },
  },
  createDashboard: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  updateDashboard: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  deleteDashboard: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  addDashboardPlacement: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  updateDashboardPlacement: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  deleteDashboardPlacement: {
    approval: "approval",
    availability: { scope: "dashboards:CUD" },
  },
  getV4MigrationData: {
    approval: "auto",
    availability: { scope: "project:read" },
  },
} satisfies Record<string, InAppAgentMcpToolPolicy>;

export type InAppAgentLangfuseMcpToolName =
  keyof typeof IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES;

/** Durable grants retain the MCP surface prefix to avoid cross-surface collisions. */
export type InAppAgentPrefixedLangfuseMcpToolName =
  `langfuse_${InAppAgentLangfuseMcpToolName}`;

export const IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES =
  new Set<InAppAgentLangfuseMcpToolName>(
    Object.keys(
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
    ) as InAppAgentLangfuseMcpToolName[],
  );

const InAppAgentLangfuseMcpToolNameSchema =
  z.custom<InAppAgentLangfuseMcpToolName>(
    (value) =>
      typeof value === "string" &&
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES.has(
        value as InAppAgentLangfuseMcpToolName,
      ),
    { message: "Invalid MCP tool name" },
  );

export const InAppAgentMcpRunOverrideSchema = z
  .union([
    z.object({ toolNames: z.array(InAppAgentLangfuseMcpToolNameSchema) }),
    z.object({ toolName: InAppAgentLangfuseMcpToolNameSchema }),
  ])
  .transform((override) => ({
    toolNames:
      "toolNames" in override ? override.toolNames : [override.toolName],
  }));

export async function createInAppAgentMcpRunOverride(params: {
  toolNames: InAppAgentLangfuseMcpToolName[];
}) {
  return JSON.stringify({
    // Older web pods read the singular field during rolling deploys.
    toolName: params.toolNames[0],
    toolNames: params.toolNames,
  });
}

export const IN_APP_AGENT_AUTO_APPROVED_EXTERNAL_TOOL_NAMES = new Set([
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
]);

export const IN_APP_AGENT_SANDBOX_TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "bash",
]);

// Runtime-owned tools never suspend; documentation tools are approved by prefix.
const IN_APP_AGENT_LOCAL_AUTO_APPROVED_TOOL_NAMES = new Set<string>([
  ...IN_APP_AGENT_AUTO_APPROVED_EXTERNAL_TOOL_NAMES,
  ...IN_APP_AGENT_SANDBOX_TOOL_NAMES,
]);

export function isMcpToolName(
  input: string,
): input is InAppAgentLangfuseMcpToolName {
  return IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES.has(
    input as InAppAgentLangfuseMcpToolName,
  );
}

export function getInAppAgentRegistryToolName(
  toolName: string | undefined,
): InAppAgentLangfuseMcpToolName | undefined {
  if (!toolName?.startsWith("langfuse_")) {
    return undefined;
  }

  const registryToolName = toolName.slice("langfuse_".length);

  return isMcpToolName(registryToolName) ? registryToolName : undefined;
}

export function getInAppAgentPrefixedToolName(
  toolName: string | undefined,
): InAppAgentPrefixedLangfuseMcpToolName | undefined {
  const registryToolName = getInAppAgentRegistryToolName(toolName);

  return registryToolName ? `langfuse_${registryToolName}` : undefined;
}

function isInAppAgentLangfuseMcpToolAvailable(params: {
  toolName: InAppAgentLangfuseMcpToolName;
  userAccess?: InAppAgentUserAccess;
}): boolean {
  if (!params.userAccess) {
    return false;
  }

  const policy = IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES[params.toolName];

  if (!policy) {
    return false;
  }

  return hasProjectAccessByRole({
    role: params.userAccess.projectRole ?? Role.MEMBER,
    admin: params.userAccess.isAdmin,
    scope: policy.availability.scope,
  });
}

export type InAppAgentToolPolicy = {
  readonly available: ReadonlySet<InAppAgentLangfuseMcpToolName>;
  readonly autoApproved: ReadonlySet<InAppAgentLangfuseMcpToolName>;
};

export function createInAppAgentToolPolicy(params: {
  userAccess?: InAppAgentUserAccess;
  alwaysAllowedTools?: Iterable<string>;
}): InAppAgentToolPolicy {
  const available = new Set<InAppAgentLangfuseMcpToolName>();
  const autoApproved = new Set<InAppAgentLangfuseMcpToolName>();

  for (const toolName of IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES) {
    if (
      !isInAppAgentLangfuseMcpToolAvailable({
        toolName,
        userAccess: params.userAccess,
      })
    ) {
      continue;
    }

    available.add(toolName);

    if (IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES[toolName].approval === "auto") {
      autoApproved.add(toolName);
    }
  }

  for (const prefixedToolName of params.alwaysAllowedTools ?? []) {
    const toolName = getInAppAgentRegistryToolName(prefixedToolName);

    if (toolName && available.has(toolName)) {
      autoApproved.add(toolName);
    }
  }

  return { available, autoApproved };
}

export function getInAppAgentMcpAllowedToolNames(
  policy: InAppAgentToolPolicy,
  oneOffToolName?: InAppAgentLangfuseMcpToolName,
): InAppAgentLangfuseMcpToolName[] {
  const allowed = new Set<InAppAgentLangfuseMcpToolName>();

  // Keep the current approval first for legacy web pods that accept one tool.
  if (oneOffToolName && policy.available.has(oneOffToolName)) {
    allowed.add(oneOffToolName);
  }

  for (const toolName of policy.autoApproved) {
    if (
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES[toolName].approval === "approval"
    ) {
      allowed.add(toolName);
    }
  }

  return [...allowed];
}

export function filterInAppAgentAvailableLangfuseMcpTools<TTool>(params: {
  tools: Partial<Record<InAppAgentLangfuseMcpToolName, TTool>> | undefined;
  policy: InAppAgentToolPolicy;
}): Partial<Record<InAppAgentLangfuseMcpToolName, TTool>> {
  return Object.fromEntries(
    Object.entries(params.tools ?? {}).flatMap(([toolName, tool]) => {
      if (!isMcpToolName(toolName) || !params.policy.available.has(toolName)) {
        return [];
      }

      return [[toolName, tool] as const];
    }),
  );
}

type InAppAgentTool = object;

export function withInAppAgentToolApproval<TTool extends InAppAgentTool>(
  tools: Record<string, TTool>,
  policy: InAppAgentToolPolicy,
): Record<string, TTool | (TTool & { requireApproval: true })> {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => [
      toolName,
      isInAppAgentAutoApprovedToolName(toolName, policy)
        ? tool
        : { ...tool, requireApproval: true },
    ]),
  ) as Record<string, TTool | (TTool & { requireApproval: true })>;
}

function isInAppAgentAutoApprovedToolName(
  toolName: string,
  policy: InAppAgentToolPolicy,
): boolean {
  const source = getInAppAgentToolApprovalSource({
    toolName,
    policy,
    toolCallId: "",
  });

  return source !== undefined && source !== "human";
}

export function getInAppAgentToolApprovalSource(params: {
  toolName: string;
  policy: InAppAgentToolPolicy;
  toolCallId: string;
  humanApprovedToolCallId?: string;
}): InAppAgentToolApprovalSource | undefined {
  if (
    params.humanApprovedToolCallId &&
    params.toolCallId === params.humanApprovedToolCallId
  ) {
    return "human";
  }

  if (
    params.toolName.startsWith("langfuseDocs_") ||
    IN_APP_AGENT_LOCAL_AUTO_APPROVED_TOOL_NAMES.has(params.toolName)
  ) {
    return "auto";
  }

  const registryToolName = getInAppAgentRegistryToolName(params.toolName);

  if (
    registryToolName === undefined ||
    !params.policy.autoApproved.has(registryToolName)
  ) {
    return undefined;
  }

  return IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES[registryToolName].approval ===
    "auto"
    ? "auto"
    : "conversation_grant";
}

export function buildInAppAgentToolApprovalSidecar(params: {
  toolCallId: string;
  toolName: string;
  policy: InAppAgentToolPolicy;
  humanApprovedToolCallId?: string;
}): AgUiCustomEvent | undefined {
  const source = getInAppAgentToolApprovalSource(params);

  if (!source) {
    return undefined;
  }

  return buildInAppAgentToolApprovalEvent({
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    source,
  });
}

export function withInAppAgentToolApprovalSidecars(params: {
  events: readonly AgUiEvent[];
  policy: InAppAgentToolPolicy;
  humanApprovedToolCallId?: string;
}): AgUiEvent[] {
  return params.events.flatMap((event) => {
    if (event.type !== EventType.TOOL_CALL_START) {
      return [event];
    }

    const toolCallId =
      typeof event.toolCallId === "string" ? event.toolCallId : undefined;
    const toolName =
      typeof event.toolCallName === "string" ? event.toolCallName : undefined;

    if (!toolCallId || !toolName) {
      return [event];
    }

    const sidecar = buildInAppAgentToolApprovalSidecar({
      toolCallId,
      toolName,
      policy: params.policy,
      humanApprovedToolCallId: params.humanApprovedToolCallId,
    });

    return sidecar ? [event, sidecar] : [event];
  });
}
