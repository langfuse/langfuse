import { useEffect, useRef } from "react";

import {
  getLatestInAppAgentToolResult,
  registerInAppAgentContextualLanding,
  useInAppAiAgent,
} from "@/src/features/in-app-agent";
import { EVALUATOR_ASSISTANT_LANDING_CONFIG } from "@/src/features/evals/v2/constants/evaluatorAssistantLanding";
import { getEvaluatorAssistantPrompt } from "@/src/features/evals/v2/fns/getEvaluatorAssistantPrompt";

export function useEvaluatorAssistantContext({
  projectId,
  evaluatorId,
  mode,
}: {
  projectId: string;
  evaluatorId: string | null;
  mode: "create" | "edit";
}) {
  const {
    isRunning,
    isSubmitting,
    open,
    pendingToolApprovals,
    selectConversation,
    selectedConversationId,
  } = useInAppAiAgent();
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const config = EVALUATOR_ASSISTANT_LANDING_CONFIG[mode];
    return registerInAppAgentContextualLanding(projectId, {
      id: `evaluator:${evaluatorId ?? "new"}`,
      ...config,
      instructions: getEvaluatorAssistantPrompt({ evaluatorId, mode }),
    });
  }, [evaluatorId, mode, projectId]);

  useEffect(() => {
    const latestResult = getLatestInAppAgentToolResult(projectId);
    const continuesEvaluatorFlow =
      selectedConversationId === latestResult?.conversationId &&
      (latestResult.toolName === "langfuse_createEvaluator" ||
        latestResult.toolName === "langfuse_updateEvaluator");
    if (
      open &&
      !wasOpenRef.current &&
      !isRunning &&
      !isSubmitting &&
      pendingToolApprovals.length === 0 &&
      !continuesEvaluatorFlow
    ) {
      selectConversation(null);
    }
    wasOpenRef.current = open;
  }, [
    isRunning,
    isSubmitting,
    open,
    pendingToolApprovals.length,
    projectId,
    selectConversation,
    selectedConversationId,
  ]);
}
