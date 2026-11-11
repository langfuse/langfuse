type MappingMessage = {
  id?: string;
  role: string;
  senderName?: string;
  parts: unknown;
  finishReason?: unknown;
  source?: "input" | "output";
  [key: string]: unknown;
};

type ThreadForMapping = {
  conversationHistory: readonly MappingMessage[];
  currentTurn: {
    messages: readonly MappingMessage[];
  };
};

function messageForMapping(message: MappingMessage) {
  return {
    ...(message.id === undefined ? {} : { id: message.id }),
    role: message.role,
    ...(message.senderName === undefined
      ? {}
      : { senderName: message.senderName }),
    parts: message.parts,
    ...(message.finishReason === undefined
      ? {}
      : { finishReason: message.finishReason }),
    ...(message.source === undefined ? {} : { source: message.source }),
  };
}

/**
 * Threads as the variable-mapping picker and the judge see them: each thread
 * is one message list, earlier turns first, then the current turn. Provenance
 * from assembly (observation, trace, times, nesting) stays off this object.
 */
export function projectThreadsForMapping(threads: readonly ThreadForMapping[]) {
  return threads.map((thread) => ({
    messages: [
      ...thread.conversationHistory.map(messageForMapping),
      ...thread.currentTurn.messages.map(messageForMapping),
    ],
  }));
}
