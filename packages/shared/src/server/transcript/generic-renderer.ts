import type { Observation } from "../../domain";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import {
  topicsTranscriptConfig,
  transcriptRenderConfigSchema,
} from "./topics-renderer-config";
import type { Transcript } from "./types";

/** Preserve the original plain-text layout as a measurement baseline. */
export function renderGenericTranscript(
  transcript: Transcript | null,
  observations: Observation[],
): string {
  const config = transcriptRenderConfigSchema.parse(topicsTranscriptConfig);
  const json = (value: unknown) =>
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const labeled = (label: string, raw: string, maxChars: number) => {
    if (maxChars === 0) return `[${label}]`;
    let content = raw.replace(
      /data:[^:;,\s]+;base64,[A-Za-z0-9+/=_-]+/g,
      "[media omitted]",
    );
    if (config.collapseWhitespace)
      content = content.replace(/\s+/g, " ").trim();
    if (content.length > maxChars) {
      const head = Math.round(maxChars * config.headRatio);
      const tail = maxChars - head;
      const omitted = (content.length - maxChars).toLocaleString("en-US");
      content =
        `${content.slice(0, head)} … [${omitted} chars omitted] … ${tail ? content.slice(-tail) : ""}`.trim();
    }
    return `[${label}] ${content}`;
  };
  const partLine = (
    message: NormalizedMessage,
    part: NormalizedMessagePart,
  ): string | null => {
    const role =
      message.role === "tool" ? config.toolResults : config[message.role];
    const roleLabel = message.senderName
      ? `${message.role} (${message.senderName})`
      : message.role;
    switch (part.type) {
      case "text":
        return role.include
          ? labeled(roleLabel, part.text, role.maxChars)
          : null;
      case "reasoning":
        return config.reasoning.include && part.content.kind === "text"
          ? labeled(
              `${roleLabel} · reasoning`,
              part.content.text,
              config.reasoning.maxChars,
            )
          : null;
      case "tool-call":
        return config.toolCalls.include
          ? labeled(
              `${roleLabel} → ${part.toolName}${part.invalid ? " (invalid)" : ""}`,
              json(part.input),
              config.toolCalls.maxChars,
            )
          : null;
      case "tool-result":
        return config.toolResults.include
          ? labeled(
              `tool ${part.toolName ?? ""} ←${part.isError ? " ERROR" : ""}`.replace(
                "  ",
                " ",
              ),
              json(part.output),
              config.toolResults.maxChars,
            )
          : null;
      case "file":
        return role.include && !part.reasoning
          ? `[${roleLabel}] [${part.mediaType ?? "file"} omitted]`
          : null;
      case "data":
      case "custom":
        return role.include
          ? labeled(
              roleLabel,
              json(
                part.type === "data" ? part.value : { [part.kind]: part.value },
              ),
              role.maxChars,
            )
          : null;
    }
  };
  const messageLines = (messages: NormalizedMessage[]): string[] =>
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const line = partLine(message, part);
        return line ? [line] : [];
      }),
    );

  const lines: string[] = [];
  if (config.toolDefinitions.include) {
    const definitions = new Map<string, string>();
    for (const observation of observations) {
      if (observation.type !== "GENERATION") continue;
      const io = {
        input: observation.input,
        output: undefined,
        metadata: observation.metadata,
      };
      for (const definition of normalizeIO({ kind: "io", io })
        .toolDefinitions) {
        if (!definitions.has(definition.name))
          definitions.set(
            definition.name,
            definition.description?.split(/(?<=\.)\s/)[0] ?? "",
          );
      }
    }
    if (definitions.size) {
      lines.push(`AVAILABLE TOOLS (${definitions.size}):`);
      for (const [name, description] of definitions)
        lines.push(
          labeled(name, description, config.toolDefinitions.maxChars).replace(
            /^\[(.*?)\]/,
            "- $1:",
          ),
        );
    }
  }

  const threads = transcript?.threads ?? [];
  threads.forEach((thread, index) => {
    if (threads.length > 1) lines.push(`=== thread ${index + 1} ===`);
    const history =
      config.history === "include"
        ? messageLines(thread.conversationHistory)
        : [];
    if (history.length) {
      lines.push(
        "--- earlier conversation ---",
        ...history,
        "--- this trace ---",
      );
    }
    lines.push(...messageLines(thread.currentTurn.messages));
  });

  if (config.errors.include) {
    const errors = observations.filter(
      (observation) =>
        observation.level === "ERROR" ||
        (observation.level === "WARNING" && observation.statusMessage),
    );
    if (errors.length) lines.push("ERRORS:");
    for (const observation of errors)
      lines.push(
        labeled(
          `${observation.level} ${observation.type} ${observation.name ?? ""}`.trim(),
          observation.statusMessage ?? "",
          config.errors.maxChars,
        ),
      );
  }
  return lines.join("\n");
}
