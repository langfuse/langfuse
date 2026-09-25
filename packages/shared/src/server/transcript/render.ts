import type { Observation } from "../../domain";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import { orderObservations } from "./ordering";
import { assembleTranscript } from "./transcript";
import type { Transcript } from "./types";
import {
  transcriptRenderConfigSchema,
  type TranscriptRenderConfig,
} from "./render-config";

export const transcriptBlockTypes = [
  "user",
  "assistant",
  "system",
  "reasoning",
  "tool_calls",
  "tool_results",
  "tool_definitions",
  "errors",
] as const;

export type TranscriptBlockType = (typeof transcriptBlockTypes)[number];
type BlockCharacters = { raw: number; clipped: number };
type Line = { text: string; removable: boolean; history?: boolean };

const redactInlineMedia = (text: string): string =>
  text.replace(/data:[^:;,\s]+;base64,[A-Za-z0-9+/=_-]+/g, "[media omitted]");

/**
 * Render an assembled trace as plain text for Topics. The caller can reuse an
 * existing transcript, and a token budget is optional.
 */
export function renderTranscript(
  transcript: Transcript | null,
  observations: Observation[],
  configInput: TranscriptRenderConfig,
  countTokens?: (text: string) => number,
): {
  text: string;
  tokens: number | null;
  stats: {
    blocksCut: number;
    messagesOmitted: number;
    blockCharacters: Record<TranscriptBlockType, BlockCharacters>;
    historyCharacters: number;
    currentTurnCharacters: number;
  };
} {
  const config = transcriptRenderConfigSchema.parse(configInput);
  let blocksCut = 0;
  const blockCharacters = Object.fromEntries(
    transcriptBlockTypes.map((block) => [block, { raw: 0, clipped: 0 }]),
  ) as Record<TranscriptBlockType, BlockCharacters>;

  const clip = (raw: string, maxChars: number, block: TranscriptBlockType) => {
    let text = redactInlineMedia(raw);
    if (config.collapseWhitespace) text = text.replace(/\s+/g, " ").trim();
    blockCharacters[block].raw += text.length;
    if (text.length > maxChars) {
      blocksCut++;
      const head = Math.round(maxChars * config.headRatio);
      const tail = maxChars - head;
      const omitted = (text.length - maxChars).toLocaleString("en-US");
      text =
        `${text.slice(0, head)} … [${omitted} chars omitted] … ${tail ? text.slice(-tail) : ""}`.trim();
    }
    blockCharacters[block].clipped += text.length;
    return text;
  };
  const json = (value: unknown) =>
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const labeled = (
    label: string,
    content: string,
    maxChars: number,
    block: TranscriptBlockType,
  ) =>
    maxChars === 0
      ? `[${label}]`
      : `[${label}] ${clip(content, maxChars, block)}`;

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
          ? labeled(
              roleLabel,
              part.text,
              role.maxChars,
              message.role === "tool" ? "tool_results" : message.role,
            )
          : null;
      case "reasoning":
        return config.reasoning.include && part.content.kind === "text"
          ? labeled(
              `${roleLabel} · reasoning`,
              part.content.text,
              config.reasoning.maxChars,
              "reasoning",
            )
          : null;
      case "tool-call":
        return config.toolCalls.include
          ? labeled(
              `${roleLabel} → ${part.toolName}${part.invalid ? " (invalid)" : ""}`,
              json(part.input),
              config.toolCalls.maxChars,
              "tool_calls",
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
              "tool_results",
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
              message.role === "tool" ? "tool_results" : message.role,
            )
          : null;
    }
  };
  const messageLines = (
    messages: NormalizedMessage[],
    history: boolean,
  ): Line[] =>
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        const text = partLine(message, part);
        return text ? [{ text, removable: true, history }] : [];
      }),
    );

  const lines: Line[] = [];
  const header = (text: string) => lines.push({ text, removable: false });

  if (config.toolDefinitions.include) {
    const definitions = new Map<string, string>();
    for (const o of observations) {
      if (o.type !== "GENERATION") continue;
      const io = { input: o.input, output: undefined, metadata: o.metadata };
      for (const d of normalizeIO({ kind: "io", io }).toolDefinitions)
        if (!definitions.has(d.name))
          definitions.set(d.name, d.description?.split(/(?<=\.)\s/)[0] ?? "");
    }
    if (definitions.size) {
      header(`AVAILABLE TOOLS (${definitions.size}):`);
      for (const [name, description] of definitions)
        header(
          labeled(
            name,
            description,
            config.toolDefinitions.maxChars,
            "tool_definitions",
          ).replace(/^\[(.*?)\]/, "- $1:"),
        );
    }
  }

  const threads = transcript?.threads ?? [];
  threads.forEach((thread, index) => {
    if (threads.length > 1) header(`=== thread ${index + 1} ===`);
    const history =
      config.history === "include"
        ? messageLines(thread.conversationHistory, true)
        : [];
    if (history.length) {
      header("--- earlier conversation ---");
      lines.push(...history);
      header("--- this trace ---");
    }
    lines.push(...messageLines(thread.currentTurn.messages, false));
  });

  if (config.errors.include) {
    const errors = observations.filter(
      (o) => o.level === "ERROR" || (o.level === "WARNING" && o.statusMessage),
    );
    if (errors.length) header("ERRORS:");
    for (const o of errors)
      header(
        labeled(
          `${o.level} ${o.type} ${o.name ?? ""}`.trim(),
          o.statusMessage ?? "",
          config.errors.maxChars,
          "errors",
        ),
      );
  }

  // Keep headers, the first and the last messages; drop from the middle.
  const removable = lines.filter((line) => line.removable);
  const select = (keep: number) => {
    if (keep >= removable.length) return lines.map((line) => line.text);
    const kept = new Set([
      ...removable.slice(0, Math.ceil(keep / 2)),
      ...removable.slice(removable.length - Math.floor(keep / 2)),
    ]);
    const out: string[] = [];
    let marked = false;
    for (const line of lines) {
      if (!line.removable || kept.has(line)) out.push(line.text);
      else if (!marked) {
        out.push(`[… ${removable.length - keep} messages omitted …]`);
        marked = true;
      }
    }
    return out;
  };
  const tokensOf = (keep: number) => countTokens!(select(keep).join("\n"));

  let keep = removable.length;
  if (
    countTokens &&
    config.maxTokens !== null &&
    tokensOf(keep) > config.maxTokens
  ) {
    let low = 0;
    let high = keep - 1;
    while (low < high) {
      const middle = low + Math.ceil((high - low) / 2);
      if (tokensOf(middle) <= config.maxTokens) low = middle;
      else high = middle - 1;
    }
    keep = low;
  }
  const text = select(keep).join("\n");
  const historyCharacters = lines
    .filter((line) => line.history === true)
    .reduce((sum, line) => sum + line.text.length, 0);
  const currentTurnCharacters = lines
    .filter((line) => line.history === false)
    .reduce((sum, line) => sum + line.text.length, 0);
  return {
    text,
    tokens: countTokens ? countTokens(text) : null,
    stats: {
      blocksCut,
      messagesOmitted: removable.length - keep,
      blockCharacters,
      historyCharacters,
      currentTurnCharacters,
    },
  };
}

/** Assemble only for callers that do not already have the shared transcript. */
export function renderTranscriptFromObservations(
  observations: Observation[],
  configInput: TranscriptRenderConfig,
  countTokens?: (text: string) => number,
) {
  const orderedObservations = orderObservations(observations);
  return renderTranscript(
    assembleTranscript(orderedObservations),
    orderedObservations,
    configInput,
    countTokens,
  );
}
