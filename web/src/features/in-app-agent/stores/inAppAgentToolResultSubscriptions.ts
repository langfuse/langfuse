export type InAppAgentToolResult = {
  projectId: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  toolArguments: unknown;
  toolResultContent?: string;
  toolError?: unknown;
};

type InAppAgentToolResultListener = (result: InAppAgentToolResult) => void;

const listenersByProjectId = new Map<
  string,
  Set<InAppAgentToolResultListener>
>();
const latestResultByProjectId = new Map<string, InAppAgentToolResult>();

export function subscribeToInAppAgentToolResults(
  projectId: string,
  listener: InAppAgentToolResultListener,
) {
  const listeners =
    listenersByProjectId.get(projectId) ??
    new Set<InAppAgentToolResultListener>();
  listeners.add(listener);
  listenersByProjectId.set(projectId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByProjectId.delete(projectId);
      queueMicrotask(() => {
        if (!listenersByProjectId.has(projectId)) {
          latestResultByProjectId.delete(projectId);
        }
      });
    }
  };
}

export function publishInAppAgentToolResult(result: InAppAgentToolResult) {
  const listeners = listenersByProjectId.get(result.projectId);
  if (!listeners || listeners.size === 0) {
    return;
  }
  latestResultByProjectId.set(result.projectId, result);
  listeners.forEach((listener) => {
    try {
      listener(result);
    } catch (error) {
      console.error("In-app agent tool result listener failed", error);
    }
  });
}

export function getLatestInAppAgentToolResult(projectId: string) {
  return latestResultByProjectId.get(projectId);
}
