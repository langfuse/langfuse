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
    }
  };
}

export function publishInAppAgentToolResult(result: InAppAgentToolResult) {
  const listeners = listenersByProjectId.get(result.projectId);
  if (!listeners || listeners.size === 0) {
    return;
  }
  listeners.forEach((listener) => {
    try {
      listener(result);
    } catch (error) {
      console.error("In-app agent tool result listener failed", error);
    }
  });
}
