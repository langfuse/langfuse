import { EventType } from "@ag-ui/core";

import type { AgUiEvent } from "@/src/ee/features/in-app-agent/schema";

export function compactTextMessageChunks(
  events: readonly AgUiEvent[],
): AgUiEvent[] {
  const compactedEvents: AgUiEvent[] = [];

  for (const event of events) {
    const previousEvent = compactedEvents.at(-1);

    if (
      event.type === EventType.TEXT_MESSAGE_CHUNK &&
      previousEvent?.type === EventType.TEXT_MESSAGE_CHUNK &&
      getString(event, "messageId") === getString(previousEvent, "messageId") &&
      getTextChunkRole(event) === "assistant" &&
      getTextChunkRole(previousEvent) === "assistant"
    ) {
      compactedEvents[compactedEvents.length - 1] = {
        ...previousEvent,
        delta:
          (getString(previousEvent, "delta") ?? "") +
          (getString(event, "delta") ?? ""),
      };
      continue;
    }

    if (event.type === EventType.REASONING_MESSAGE_START) {
      compactedEvents.push({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: getString(event, "messageId"),
        role: "reasoning",
        delta: "",
        ...(getNumber(event, "timestamp") !== undefined
          ? { startedAt: getNumber(event, "timestamp") }
          : {}),
      });
      continue;
    }

    if (
      isReasoningContentEvent(event) &&
      previousEvent?.type === EventType.REASONING_MESSAGE_CONTENT &&
      getString(event, "messageId") === getString(previousEvent, "messageId")
    ) {
      compactedEvents[compactedEvents.length - 1] = {
        ...previousEvent,
        delta:
          (getString(previousEvent, "delta") ?? "") +
          (getString(event, "delta") ?? ""),
        ...(getNumber(event, "startedAt") !== undefined
          ? { startedAt: getNumber(event, "startedAt") }
          : {}),
        ...(getNumber(event, "timestamp") !== undefined
          ? { endedAt: getNumber(event, "timestamp") }
          : {}),
      };
      continue;
    }

    if (
      event.type === EventType.REASONING_ENCRYPTED_VALUE &&
      previousEvent?.type === EventType.REASONING_MESSAGE_CONTENT &&
      getString(event, "entityId") === getString(previousEvent, "messageId")
    ) {
      compactedEvents[compactedEvents.length - 1] = {
        ...previousEvent,
        encryptedValue: getString(event, "encryptedValue"),
        ...(getNumber(event, "timestamp") !== undefined
          ? { endedAt: getNumber(event, "timestamp") }
          : {}),
      };
      continue;
    }

    if (
      event.type === EventType.REASONING_MESSAGE_END &&
      previousEvent?.type === EventType.REASONING_MESSAGE_CONTENT &&
      getString(event, "messageId") === getString(previousEvent, "messageId")
    ) {
      compactedEvents[compactedEvents.length - 1] = {
        ...previousEvent,
        ...(getNumber(event, "timestamp") !== undefined
          ? { endedAt: getNumber(event, "timestamp") }
          : {}),
      };
      continue;
    }

    compactedEvents.push(event);
  }

  return compactedEvents;
}

function getTextChunkRole(event: unknown) {
  const role = getString(event, "role");

  return role === undefined || role === "assistant" ? "assistant" : role;
}

function isReasoningContentEvent(event: AgUiEvent) {
  return (
    event.type === EventType.REASONING_MESSAGE_CONTENT ||
    event.type === EventType.REASONING_MESSAGE_CHUNK
  );
}

function getString(event: unknown, key: string): string | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  const value = event[key];
  return typeof value === "string" ? value : undefined;
}

function getNumber(event: unknown, key: string): number | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  const value = event[key];
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
