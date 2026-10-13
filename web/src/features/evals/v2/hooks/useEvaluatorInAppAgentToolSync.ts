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

const EDITOR_UPDATE_HIGHLIGHT_DURATION_MS = 3_200;
const EDITOR_UPDATE_HIGHLIGHT_GRACE_MS = 1_000;
type EditorUpdateSurface = "code" | "prompt";
type PendingEditorUpdateHighlight = {
  id: string;
  surface: EditorUpdateSurface;
};

function getEditorUpdateHighlightKey(projectId: string, evaluatorId: string) {
  return `langfuse:evaluator-assistant-highlight:${projectId}:${evaluatorId}`;
}

function takePendingEditorUpdateHighlight(
  projectId: string,
  evaluatorId: string | null,
): PendingEditorUpdateHighlight | null {
  if (!evaluatorId || typeof window === "undefined") {
    return null;
  }

  const key = getEditorUpdateHighlightKey(projectId, evaluatorId);
  try {
    const value = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    if (!value) {
      return null;
    }
    const pending = JSON.parse(value) as {
      id?: unknown;
      surface?: unknown;
      expiresAt?: unknown;
    };
    return typeof pending.id === "string" &&
      (pending.surface === "code" || pending.surface === "prompt") &&
      typeof pending.expiresAt === "number" &&
      pending.expiresAt > Date.now()
      ? { id: pending.id, surface: pending.surface }
      : null;
  } catch {
    return null;
  }
}

function preserveEditorUpdateHighlight(
  projectId: string,
  evaluatorId: string,
  updateId: string,
  surface: EditorUpdateSurface,
) {
  const key = getEditorUpdateHighlightKey(projectId, evaluatorId);
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        id: updateId,
        surface,
        expiresAt:
          Date.now() +
          EDITOR_UPDATE_HIGHLIGHT_DURATION_MS +
          EDITOR_UPDATE_HIGHLIGHT_GRACE_MS,
      }),
    );
    window.setTimeout(() => {
      try {
        const pending = window.sessionStorage.getItem(key);
        if (pending && JSON.parse(pending)?.id === updateId) {
          window.sessionStorage.removeItem(key);
        }
      } catch {
        // Ignore unavailable or malformed session storage.
      }
    }, EDITOR_UPDATE_HIGHLIGHT_DURATION_MS + EDITOR_UPDATE_HIGHLIGHT_GRACE_MS);
  } catch {
    // Storage can be unavailable; the current mount still shows the highlight.
  }
}

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
  const [initialEditorUpdate] = useState(() =>
    takePendingEditorUpdateHighlight(projectId, evaluatorId),
  );
  const [codeUpdateId, setCodeUpdateId] = useState<string | null>(
    initialEditorUpdate?.surface === "code" ? initialEditorUpdate.id : null,
  );
  const [promptUpdateId, setPromptUpdateId] = useState<string | null>(
    initialEditorUpdate?.surface === "prompt" ? initialEditorUpdate.id : null,
  );
  const [testUpdateId, setTestUpdateId] = useState<string | null>(null);
  const handledTestToolCallIdRef = useRef<string | null>(null);
  const handledLiveToolCallIdsRef = useRef(new Set<string>());

  useEffect(() => {
    handledLiveToolCallIdsRef.current.clear();
    handledTestToolCallIdRef.current = null;
  }, [selectedConversationId]);

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
        !selectedConversationId ||
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
        evaluatorUpdated: async (updateId, surface, toolArguments) => {
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
          preserveEditorUpdateHighlight(
            projectId,
            evaluatorId,
            updateId,
            surface,
          );
          if (surface === "prompt") {
            setPromptUpdateId(updateId);
          } else {
            setCodeUpdateId(updateId);
          }
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

  return { codeUpdateId, promptUpdateId, testUpdateId };
}
