import { EventType } from "@ag-ui/core";

import { createConversationMessageAccumulator } from "@langfuse/shared/in-app-agent/server/persistence";
import type { PersistedConversationEvent } from "@langfuse/shared/in-app-agent/server/persistence";

import {
  createInAppAgentDisplayState,
  recordInAppAgentMessagesForDisplay,
  recordInAppAgentToolCallForDisplay,
} from "@/src/features/in-app-agent/lib/display";

/**
 * Rebuilds both representations a browser needs from one read of the persisted
 * event log: the canonical AG-UI messages that seed the live agent, and the
 * display state that tells the client-side projection where interleaved
 * reasoning and tool calls belong.
 *
 * Deliberately does not project and does not prune. Projection happens once, at
 * render time. Pruning unpaired tool calls here would break a resumed run: the
 * arriving TOOL_CALL_RESULT needs its tool call present in the seed.
 */
export function getConversationSnapshotFromEvents(
  events: readonly PersistedConversationEvent[],
) {
  const accumulator = createConversationMessageAccumulator([]);
  let displayState = createInAppAgentDisplayState();
  const deferredToolCallParents = new Map<string, string | undefined>();

  for (const { event, runId } of events) {
    if (event.type === EventType.TOOL_CALL_START) {
      const toolCallId = getEventString(event, "toolCallId");
      if (toolCallId) {
        const parentMessageId = getEventString(event, "parentMessageId");
        if (
          parentMessageId &&
          accumulator
            .getMessages()
            .some((message) => message.id === parentMessageId)
        ) {
          displayState = recordInAppAgentToolCallForDisplay(
            displayState,
            toolCallId,
            parentMessageId,
          );
        } else {
          deferredToolCallParents.set(toolCallId, parentMessageId);
        }
      }
    }

    if (accumulator.processEvent(event, runId)) {
      displayState = recordInAppAgentMessagesForDisplay(
        displayState,
        accumulator.getMessages(),
      );
    }

    if (event.type === EventType.TOOL_CALL_END) {
      const toolCallId = getEventString(event, "toolCallId");
      if (toolCallId && deferredToolCallParents.has(toolCallId)) {
        displayState = recordInAppAgentToolCallForDisplay(
          displayState,
          toolCallId,
          deferredToolCallParents.get(toolCallId),
        );
        deferredToolCallParents.delete(toolCallId);
      }
    }
  }

  return { messages: accumulator.getMessages(), displayState };
}

function getEventString(event: unknown, key: string): string | undefined {
  if (typeof event !== "object" || event === null) {
    return undefined;
  }

  const value = (event as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
