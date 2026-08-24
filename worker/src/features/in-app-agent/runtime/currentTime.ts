import { isRecord } from "@langfuse/shared/in-app-agent/server/toolErrors";
import type { ProcessLLMRequestArgs, Processor } from "@mastra/core/processors";

const CURRENT_TIME_TAG_PREFIX = "<current_time";

export function getUserTimeZone(
  context: Array<{ description?: string; value?: unknown }>,
): string {
  const item = context.find(
    (entry) => entry.description === "current_timezone",
  );
  const value = typeof item?.value === "string" ? item.value.trim() : "";
  return isValidTimeZone(value) ? value : "UTC";
}

export function formatCurrentTimeContext(now: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `<current_time tz="${zone}">${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}</current_time>`;
}

export function isCurrentTimePromptMessage(message: unknown): boolean {
  if (!isRecord(message) || message.role !== "user") {
    return false;
  }

  const content = message.content;
  if (typeof content === "string") {
    return content.startsWith(CURRENT_TIME_TAG_PREFIX);
  }

  if (!Array.isArray(content)) {
    return false;
  }

  for (const part of content) {
    if (
      isRecord(part) &&
      part.type === "text" &&
      typeof part.text === "string"
    ) {
      return part.text.startsWith(CURRENT_TIME_TAG_PREFIX);
    }
  }

  return false;
}

export class CurrentTimeProcessor implements Processor {
  readonly id = "current-time";

  constructor(
    private readonly timeZone: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  processLLMRequest({ prompt }: ProcessLLMRequestArgs) {
    if (isCurrentTimePromptMessage(prompt.at(-1))) {
      return;
    }

    return {
      prompt: [
        ...prompt,
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: formatCurrentTimeContext(this.now(), this.timeZone),
            },
          ],
        },
      ],
    };
  }
}

function isValidTimeZone(timeZone: string) {
  if (!timeZone) {
    return false;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
