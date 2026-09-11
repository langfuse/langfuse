import type { Observation } from "../../../domain";
import type {
  NormalizedMessagePart,
  NormalizedMessageRole,
} from "../../../utils/normalized-io";
import type { Transcript } from "../types";

const MAX_TEXT = 400;

const clip = (text: string) =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;

const ROLE_LABEL: Record<NormalizedMessageRole, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `key: value` per field for objects, one line otherwise. */
function fieldLines(value: unknown): string[] {
  if (!isRecord(value)) return [clip(JSON.stringify(value) ?? "undefined")];
  return Object.entries(value).map(([key, field]) => {
    const rendered =
      typeof field === "string"
        ? field
        : (JSON.stringify(field) ?? "undefined");
    return `${key}: ${clip(rendered)}`;
  });
}

/** Content lines for one part, without the message indent. */
function partLines(part: NormalizedMessagePart): string[] {
  const indent = (lines: string[]) => lines.map((line) => `    ${line}`);
  switch (part.type) {
    case "text":
      return [clip(part.refusal ? `(refusal) ${part.text}` : part.text)];
    case "reasoning":
      return part.content.kind === "text"
        ? [`(reasoning) ${clip(part.content.text)}`]
        : [`(reasoning: ${part.content.kind})`];
    case "tool-call":
      return [
        `⚙ ${part.toolName}  ${part.toolCallId ?? "no id"}${part.invalid ? "  (invalid)" : ""}`,
        "  Parameters",
        ...indent(fieldLines(part.input)),
      ];
    case "tool-result":
      return [
        `⤷ ${part.toolName ?? "tool result"}  ${part.toolCallId ?? "no id"}${part.isError ? "  (error)" : ""}`,
        "  Result",
        ...indent(fieldLines(part.output)),
      ];
    case "file":
      return [`📎 ${part.mediaType ?? "file"} (${part.content.kind})`];
    case "data":
      return ["Data", ...indent(fieldLines(part.value))];
    case "custom":
      return [`Custom ${part.kind}`, ...indent(fieldLines(part.value))];
  }
}

/**
 * Chat-shaped rendering of a transcript for eyeballing during development:
 * one block per message with a role label and the emitting generation, tool
 * calls and results as parameter lists, everything else as text.
 */
export function formatTranscript(
  title: string,
  transcript: Transcript | null,
  observations: Observation[] = [],
  options: { hideReasoning?: boolean } = {},
): string {
  const names = new Map(observations.map((o) => [o.id, o.name ?? ""]));
  const label = (id: string) => {
    const name = names.get(id);
    return name ? `${name} (${id})` : id;
  };

  const lines = [`━━ ${title}`];

  if (transcript === null) {
    lines.push("  (null transcript)");
    return lines.join("\n");
  }

  transcript.threads.forEach((thread, threadIndex) => {
    lines.push(
      "",
      `┌ thread ${threadIndex + 1} · trace(s) ${thread.traceIds.join(", ")}`,
      `│ generations: ${thread.generationIds.map(label).join(", ")}`,
    );

    for (const message of thread.messages) {
      const parts = options.hideReasoning
        ? message.parts.filter((part) => part.type !== "reasoning")
        : message.parts;
      if (options.hideReasoning && parts.length === 0) continue;
      const sender = message.senderName ? ` (${message.senderName})` : "";
      lines.push(
        "│",
        `│ ${ROLE_LABEL[message.role]}${sender} · ${label(message.generationId)} · ${message.source}`,
      );
      for (const part of parts) {
        for (const line of partLines(part)) lines.push(`│   ${line}`);
      }
    }
    lines.push("└");
  });

  return lines.join("\n");
}
