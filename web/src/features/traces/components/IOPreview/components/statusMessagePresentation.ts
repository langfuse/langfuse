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

export function getStatusMessagePresentation(
  level: ObservationLevelType,
  titles: Record<ObservationLevelType, string>,
) {
  if (level === "ERROR") {
    return {
      title: titles.ERROR,
      tone: "danger" as const,
    };
  }

  if (level === "WARNING") {
    return {
      title: titles.WARNING,
      tone: "warning" as const,
    };
  }

  if (level === "DEBUG") {
    return {
      title: titles.DEBUG,
      tone: "muted" as const,
    };
  }

  if (level === "DEFAULT") {
    return {
      title: titles.DEFAULT,
      tone: "neutral" as const,
    };
  }

  return assertUnreachable(level);
}
