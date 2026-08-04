import type { InAppAgentLangfuseMcpToolName } from "@langfuse/shared/in-app-agent/server/tools";
import { safeJsonParse } from "@langfuse/shared";
import { IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE } from "@langfuse/shared/in-app-agent";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import type { api } from "@/src/utils/api";
import { assertUnreachable } from "@/src/utils/types";

export type InAppAgentTrpcInvalidationTarget =
  | "annotationQueues"
  | "annotationQueueItems"
  | "annotationQueueAssignments"
  | "comments"
  | "dashboard"
  | "dashboardWidgets"
  | "datasets"
  | "evals"
  | "experiments"
  | "models"
  | "prompts"
  | "scoreAnalytics"
  | "scoreConfigs"
  | "scores";

type InAppAgentMcpToolName = `langfuse_${InAppAgentLangfuseMcpToolName}`;

const IN_APP_AGENT_TOOL_TRPC_INVALIDATION_TARGETS = {
  langfuse_listAnnotationQueues: [],
  langfuse_createAnnotationQueue: ["annotationQueues"],
  langfuse_getAnnotationQueue: [],
  langfuse_listAnnotationQueueItems: [],
  langfuse_getAnnotationQueueItem: [],
  langfuse_createAnnotationQueueItem: [
    "annotationQueues",
    "annotationQueueItems",
  ],
  langfuse_updateAnnotationQueueItem: [
    "annotationQueues",
    "annotationQueueItems",
  ],
  langfuse_deleteAnnotationQueueItem: [
    "annotationQueues",
    "annotationQueueItems",
  ],
  langfuse_createAnnotationQueueAssignment: [
    "annotationQueues",
    "annotationQueueAssignments",
  ],
  langfuse_deleteAnnotationQueueAssignment: [
    "annotationQueues",
    "annotationQueueAssignments",
  ],
  langfuse_createComment: ["comments"],
  langfuse_listComments: [],
  langfuse_getComment: [],
  langfuse_upsertDataset: ["datasets"],
  langfuse_listDatasets: [],
  langfuse_getDataset: [],
  langfuse_upsertDatasetItem: ["datasets"],
  langfuse_listDatasetItems: [],
  langfuse_getDatasetItem: [],
  langfuse_deleteDatasetItem: ["datasets"],
  langfuse_createDatasetRunItem: ["datasets", "experiments"],
  langfuse_listDatasetRunItems: [],
  langfuse_listDatasetRuns: [],
  langfuse_getDatasetRun: [],
  langfuse_deleteDatasetRun: ["datasets", "experiments"],
  langfuse_listEvaluators: [],
  langfuse_getEvaluator: [],
  langfuse_upsertEvaluator: ["evals", "models"],
  langfuse_deleteEvaluator: ["evals", "models"],
  langfuse_listEvaluationRules: [],
  langfuse_getEvaluationRule: [],
  langfuse_createEvaluationRule: ["evals"],
  langfuse_updateEvaluationRule: ["evals"],
  langfuse_deleteEvaluationRule: ["evals"],
  langfuse_listExperiments: [],
  langfuse_listExperimentItems: [],
  langfuse_submitFeedback: ["scores", "scoreAnalytics"],
  langfuse_getHealth: [],
  langfuse_getMedia: [],
  langfuse_queryMetrics: [],
  langfuse_getMetricsSchema: [],
  langfuse_listModels: [],
  langfuse_createModel: ["models"],
  langfuse_getModel: [],
  langfuse_deleteModel: ["models"],
  langfuse_listObservations: [],
  langfuse_getObservation: [],
  langfuse_getObservationFieldSchema: [],
  langfuse_getObservationFilterSchema: [],
  langfuse_getObservationFilterValues: [],
  langfuse_getPrompt: [],
  langfuse_getPromptUnresolved: [],
  langfuse_listMonitors: [],
  langfuse_getMonitor: [],
  langfuse_listPrompts: [],
  langfuse_createTextPrompt: ["prompts"],
  langfuse_createChatPrompt: ["prompts"],
  langfuse_updatePromptLabels: ["prompts"],
  langfuse_listScores: [],
  langfuse_getScore: [],
  langfuse_createScore: ["scores", "scoreAnalytics"],
  langfuse_listScoreConfigs: [],
  langfuse_getScoreConfig: [],
  langfuse_createScoreConfig: ["scoreConfigs"],
  langfuse_updateScoreConfig: ["scoreConfigs"],
  langfuse_deleteScoreConfig: ["scoreConfigs"],
  langfuse_createDashboardWidget: ["dashboard", "dashboardWidgets"],
  langfuse_listDashboardWidgets: [],
  langfuse_getDashboardWidget: [],
  langfuse_updateDashboardWidget: ["dashboard", "dashboardWidgets"],
  langfuse_deleteDashboardWidget: ["dashboard", "dashboardWidgets"],
  langfuse_listDashboards: [],
  langfuse_getDashboard: [],
  langfuse_createDashboard: ["dashboard"],
  langfuse_updateDashboard: ["dashboard"],
  langfuse_deleteDashboard: ["dashboard"],
  langfuse_addDashboardPlacement: ["dashboard"],
  langfuse_updateDashboardPlacement: ["dashboard"],
  langfuse_deleteDashboardPlacement: ["dashboard"],
} as const satisfies Record<
  InAppAgentMcpToolName,
  readonly InAppAgentTrpcInvalidationTarget[]
>;

export function getInAppAgentTrpcInvalidationTargets(toolName: string) {
  return (
    IN_APP_AGENT_TOOL_TRPC_INVALIDATION_TARGETS[
      toolName as keyof typeof IN_APP_AGENT_TOOL_TRPC_INVALIDATION_TARGETS
    ] ?? []
  );
}

export function shouldPerformToolSideEffects(toolError: unknown) {
  const parsedError =
    typeof toolError === "string" ? safeJsonParse(toolError) : toolError;

  if (
    typeof parsedError !== "object" ||
    parsedError === null ||
    !("code" in parsedError)
  ) {
    return true;
  }

  return parsedError.code !== IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE;
}

export function performTargetInvalidation(
  target: InAppAgentTrpcInvalidationTarget,
  utils: ReturnType<typeof api.useUtils>,
) {
  if (target === "annotationQueues") {
    return utils.annotationQueues.invalidate();
  }
  if (target === "annotationQueueItems") {
    return utils.annotationQueueItems.invalidate();
  }
  if (target === "annotationQueueAssignments") {
    return utils.annotationQueueAssignments.invalidate();
  }
  if (target === "comments") {
    return utils.comments.invalidate();
  }
  if (target === "dashboard") {
    return utils.dashboard.invalidate();
  }
  if (target === "dashboardWidgets") {
    return utils.dashboardWidgets.invalidate();
  }
  if (target === "datasets") {
    return utils.datasets.invalidate();
  }
  if (target === "evals") {
    return utils.evals.invalidate();
  }
  if (target === "experiments") {
    return utils.experiments.invalidate();
  }
  if (target === "models") {
    return utils.models.invalidate();
  }
  if (target === "prompts") {
    return utils.prompts.invalidate();
  }
  if (target === "scoreAnalytics") {
    return utils.scoreAnalytics.invalidate();
  }
  if (target === "scoreConfigs") {
    return utils.scoreConfigs.invalidate();
  }
  if (target === "scores") {
    return utils.scores.invalidate();
  }

  return assertUnreachable(target);
}

export function performToolSideEffects({
  toolName,
  utils,
}: {
  toolName: string;
  utils: ReturnType<typeof api.useUtils>;
}) {
  const targets = getInAppAgentTrpcInvalidationTargets(toolName);

  return Promise.all(
    targets.map((target) => performTargetInvalidation(target, utils)),
  );
}

type CompletedToolCall = {
  toolCallId: string;
  toolName: string;
};

/**
 * Reconstruct completed tool calls from the durable conversation messages.
 * Background runs can finish while the drawer is detached, so the browser
 * cannot rely on having observed the live TOOL_CALL_RESULT event.
 */
export function getCompletedToolCalls(messages: readonly AgUiMessage[]) {
  const toolCalls = new Map<string, CompletedToolCall>();
  const toolResults = new Map<string, Extract<AgUiMessage, { role: "tool" }>>();

  for (const message of messages) {
    if (message.role === "assistant") {
      for (const toolCall of message.toolCalls ?? []) {
        toolCalls.set(toolCall.id, {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
        });
      }
      continue;
    }

    if (message.role === "tool") {
      toolResults.set(message.toolCallId, message);
    }
  }

  return Array.from(toolCalls.values()).flatMap((toolCall) => {
    const result = toolResults.get(toolCall.toolCallId);
    if (!result || !shouldPerformToolSideEffects(result.error)) {
      return [];
    }

    return [toolCall];
  });
}

export function performToolSideEffectsForToolCall({
  toolCallId,
  toolName,
  toolError,
  handledToolCallIds,
  utils,
}: {
  toolCallId: string;
  toolName: string;
  toolError?: unknown;
  handledToolCallIds: Set<string>;
  utils: ReturnType<typeof api.useUtils>;
}) {
  if (
    handledToolCallIds.has(toolCallId) ||
    !shouldPerformToolSideEffects(toolError)
  ) {
    return Promise.resolve([]);
  }

  handledToolCallIds.add(toolCallId);
  return performToolSideEffects({ toolName, utils });
}

export function performToolSideEffectsForMessages({
  messages,
  handledToolCallIds,
  utils,
}: {
  messages: readonly AgUiMessage[];
  handledToolCallIds: Set<string>;
  utils: ReturnType<typeof api.useUtils>;
}) {
  return Promise.all(
    getCompletedToolCalls(messages).map((toolCall) =>
      performToolSideEffectsForToolCall({
        ...toolCall,
        handledToolCallIds,
        utils,
      }),
    ),
  );
}
