import { deepParseJson, type ObservationLevelType } from "@langfuse/shared";
import { assertUnreachable } from "@/src/utils/types";

// Status messages do not use the async I/O parser. Keep shallow structured
// values below the eager JSON viewers' tree budget; larger values stay text.
const STATUS_MESSAGE_JSON_PARSE_LIMIT = 5_000;

export interface ObservationStatusMessage {
  level: ObservationLevelType;
  message: string;
}

export function parseStructuredStatusMessage(message: string) {
  if (message.length > STATUS_MESSAGE_JSON_PARSE_LIMIT) return undefined;

  const parsed = deepParseJson(message, {
    maxSize: STATUS_MESSAGE_JSON_PARSE_LIMIT,
    maxDepth: 2,
  });

  return typeof parsed === "object" && parsed !== null ? parsed : undefined;
}

export function getStatusMessagePresentation(level: ObservationLevelType) {
  if (level === "ERROR") {
    return {
      title: "Error",
      tone: "danger" as const,
    };
  }

  if (level === "WARNING") {
    return {
      title: "Warning",
      tone: "warning" as const,
    };
  }

  if (level === "DEBUG") {
    return {
      title: "Debug",
      tone: "muted" as const,
    };
  }

  if (level === "DEFAULT") {
    return {
      title: "Status",
      tone: "neutral" as const,
    };
  }

  return assertUnreachable(level);
}
