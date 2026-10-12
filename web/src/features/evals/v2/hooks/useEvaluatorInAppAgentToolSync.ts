import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/router";
import { safeJsonParse } from "@langfuse/shared";

import {
  getCompletedInAppAgentToolCalls,
  subscribeToInAppAgentToolResults,
  useInAppAiAgent,
  type InAppAgentToolResult,
} from "@/src/features/in-app-agent";
import { applyEvaluatorInAppAgentToolResult } from "@/src/features/evals/v2/fns/applyEvaluatorInAppAgentToolResult";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api } from "@/src/utils/api";

export function useEvaluatorInAppAgentToolSync({
  projectId,
  evaluatorId,
  store,
  setTestResult,
  setHasCompletedTestCall,
  setLastTestRunCostUsd,
  setRawResultOpen,
}: {
  projectId: string;
  evaluatorId: string | null;
  store: EvaluatorSetupStore;
  setTestResult: Dispatch<SetStateAction<unknown>>;
  setHasCompletedTestCall: Dispatch<SetStateAction<boolean>>;
  setLastTestRunCostUsd: Dispatch<SetStateAction<number | null>>;
  setRawResultOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { messages, open, selectedConversationId } = useInAppAiAgent();
  const [editorUpdateId, setEditorUpdateId] = useState<string | null>(null);
  const [testUpdateId, setTestUpdateId] = useState<string | null>(null);
  const handledTestToolCallIdRef = useRef<string | null>(null);
  const handledLiveToolCallIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!open) {
      return;
    }
    const applyTestResult = (
      result: Record<string, unknown>,
      updateId: string,
    ) => {
      handledTestToolCallIdRef.current = updateId;
      setTestResult(result);
      setHasCompletedTestCall("executionTraceId" in result);
      setLastTestRunCostUsd(
        typeof result.estimatedCostUsd === "number"
          ? result.estimatedCostUsd
          : null,
      );
      setRawResultOpen(false);
      store.getState().actions.setTestPanelOpen(true);
      setTestUpdateId(updateId);
    };

    const handleResult = (result: InAppAgentToolResult) => {
      if (
        selectedConversationId &&
        result.conversationId !== selectedConversationId
      ) {
        return;
      }
      if (handledLiveToolCallIdsRef.current.has(result.toolCallId)) {
        return;
      }
      handledLiveToolCallIdsRef.current.add(result.toolCallId);

      applyEvaluatorInAppAgentToolResult({
        evaluatorId,
        result,
        applyFilter: (filter, updateId) => {
          const state = store.getState();
          state.actions.setSampleFilter(filter);
          state.actions.setSelectedObservation(null);
          state.actions.setTestPanelOpen(true);
          setTestUpdateId(updateId);
        },
        applyTestResult,
        evaluatorCreated: (createdEvaluatorId) => {
          router
            .push(`/project/${projectId}/evals/${createdEvaluatorId}`)
            .catch((error: unknown) => {
              console.error("Failed to open the created evaluator", error);
            });
        },
        evaluatorUpdated: async (updateId, _surface, toolArguments) => {
          if (!evaluatorId) {
            return;
          }
          const state = store.getState();
          if (typeof toolArguments.name === "string") {
            state.actions.setName(toolArguments.name);
          }
          if (
            typeof toolArguments.description === "string" ||
            toolArguments.description === null
          ) {
            state.actions.setDescription(toolArguments.description ?? "");
          }
          setEditorUpdateId(updateId);
          await utils.evalsV2.get.invalidate({ projectId, evaluatorId });
        },
      }).catch((error: unknown) => {
        console.error("Failed to apply evaluator Assistant tool result", error);
      });
    };

    const unsubscribe = subscribeToInAppAgentToolResults(
      projectId,
      handleResult,
    );
    return unsubscribe;
  }, [
    evaluatorId,
    open,
    projectId,
    router,
    selectedConversationId,
    setHasCompletedTestCall,
    setLastTestRunCostUsd,
    setRawResultOpen,
    setTestResult,
    store,
    utils,
  ]);

  useEffect(() => {
    if (!open || !evaluatorId || !selectedConversationId) {
      return;
    }
    const completedTest = getCompletedInAppAgentToolCalls(messages)
      .toReversed()
      .find((toolCall) => {
        if (toolCall.toolName !== "langfuse_testEvaluator") {
          return false;
        }
        const argumentsValue =
          typeof toolCall.toolArguments === "string"
            ? safeJsonParse(toolCall.toolArguments)
            : toolCall.toolArguments;
        return (
          typeof argumentsValue === "object" &&
          argumentsValue !== null &&
          "evaluatorId" in argumentsValue &&
          argumentsValue.evaluatorId === evaluatorId
        );
      });
    if (
      !completedTest ||
      handledTestToolCallIdRef.current === completedTest.toolCallId
    ) {
      return;
    }

    applyEvaluatorInAppAgentToolResult({
      evaluatorId,
      result: {
        projectId,
        conversationId: selectedConversationId,
        ...completedTest,
      },
      applyFilter: () => undefined,
      applyTestResult: (result, updateId) => {
        handledTestToolCallIdRef.current = updateId;
        setTestResult(result);
        setHasCompletedTestCall("executionTraceId" in result);
        setLastTestRunCostUsd(
          typeof result.estimatedCostUsd === "number"
            ? result.estimatedCostUsd
            : null,
        );
        setRawResultOpen(false);
        store.getState().actions.setTestPanelOpen(true);
      },
      evaluatorCreated: () => undefined,
      evaluatorUpdated: async () => undefined,
    }).catch((error: unknown) => {
      console.error("Failed to restore evaluator Assistant test result", error);
    });
  }, [
    evaluatorId,
    messages,
    open,
    projectId,
    selectedConversationId,
    setHasCompletedTestCall,
    setLastTestRunCostUsd,
    setRawResultOpen,
    setTestResult,
    store,
  ]);

  return { editorUpdateId, testUpdateId };
}
