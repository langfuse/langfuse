import type {
  FilePart,
  JsonValue,
  NormalizedIO,
  NormalizedMessage,
  NormalizedMessagePart,
  ToolDefinition as NormalizedToolDefinition,
} from "@langfuse/shared/src/utils/normalized-io";
import { extractAdditionalInput } from "@/src/utils/chatml";
import {
  computeToolCallBookkeeping,
  type ChatMlMessage,
  type ChatMLParserResult,
} from "../hooks/useChatMLParser";

const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function toMediaReference(file: FilePart): string | undefined {
  if (file.content.kind !== "reference") return undefined;

  const source = file.providerMetadata?.source;
  const mediaType = file.mediaType;
  if (typeof source !== "string" || !mediaType) return undefined;

  return `${MEDIA_REFERENCE_PREFIX}type=${mediaType}|id=${file.content.id}|source=${source}@@@`;
}

function toImageContentPart(file: FilePart): Record<string, unknown> | string {
  const reference = toMediaReference(file);
  if (reference) {
    return {
      type: "image_url",
      image_url: { url: reference },
    };
  }

  if (file.content.kind === "url") {
    return {
      type: "image_url",
      image_url: { url: file.content.url },
    };
  }

  if (file.content.kind === "reference") {
    return file.content.id;
  }

  const data = file.content.data.startsWith("data:")
    ? file.content.data
    : `data:${file.mediaType ?? "image/*"};base64,${file.content.data}`;
  return {
    type: "image_url",
    image_url: { url: data },
  };
}

function toToolDefinition(definition: NormalizedToolDefinition): {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  type?: string;
} {
  const parameters = isRecord(definition.inputSchema)
    ? definition.inputSchema
    : undefined;

  return {
    name: definition.name,
    ...(definition.description ? { description: definition.description } : {}),
    ...(parameters ? { parameters } : {}),
    ...(definition.type ? { type: definition.type } : {}),
  };
}

type ToolCallResponse = { output: JsonValue; isError?: boolean } | null;

function toToolCallPart(
  part: Extract<NormalizedMessagePart, { type: "tool-call" }>,
) {
  return {
    id: part.toolCallId ?? "",
    name: part.toolName,
    arguments: part.input,
    ...(part.toolType ? { type: part.toolType } : {}),
    // Paired by toIOPreview below; null = no result in this observation.
    response: null as ToolCallResponse,
  };
}

function toToolResultMessage(
  part: Extract<NormalizedMessagePart, { type: "tool-result" }>,
): ChatMlMessage {
  // Deliberately no `name`: the renderer titles messages name-over-role, and
  // a tool result must render as a tool turn, not as a participant named
  // after the tool. The tool name stays on the paired tool-call part.
  return {
    role: "tool",
    ...(part.toolCallId ? { tool_call_id: part.toolCallId } : {}),
    content: part.output,
  } as ChatMlMessage;
}

type ProjectedMessage = {
  main: ChatMlMessage | undefined;
  toolCallEntries: ReturnType<typeof toToolCallPart>[];
  toolResultParts: Extract<NormalizedMessagePart, { type: "tool-result" }>[];
};

function toChatMessages(message: NormalizedMessage): ProjectedMessage {
  const contentParts: Array<string | Record<string, unknown>> = [];
  const thinking: Array<{
    type: "thinking";
    content: string;
    signature?: string;
  }> = [];
  const redactedThinking: Array<{ type: "redacted_thinking"; data: string }> =
    [];
  const jsonParts: unknown[] = [];
  const toolCalls: ReturnType<typeof toToolCallPart>[] = [];
  const toolResults: Extract<NormalizedMessagePart, { type: "tool-result" }>[] =
    [];

  for (const part of message.parts) {
    switch (part.type) {
      case "text":
        contentParts.push(part.text);
        break;
      case "reasoning":
        if (part.content.kind === "text") {
          thinking.push({
            type: "thinking",
            content: part.content.text,
            ...(part.content.signature
              ? { signature: part.content.signature }
              : {}),
          });
        } else if (
          part.content.kind === "redacted" ||
          part.content.kind === "encrypted"
        ) {
          redactedThinking.push({
            type: "redacted_thinking",
            data: part.content.data,
          });
        } else {
          jsonParts.push(part.content.value);
        }
        break;
      case "tool-call":
        toolCalls.push(toToolCallPart(part));
        break;
      case "tool-result":
        toolResults.push(part);
        break;
      case "file":
        if (part.mediaType?.startsWith("image/")) {
          contentParts.push(toImageContentPart(part));
        } else {
          // The existing ChatML renderer has no generic file part. Keep the
          // complete normalized value in the passthrough JSON view instead.
          jsonParts.push(part);
        }
        break;
      case "data":
        jsonParts.push(part.value);
        break;
      case "custom":
        jsonParts.push({ kind: part.kind, value: part.value });
        break;
    }
  }

  const hasImages = contentParts.some((part) => typeof part !== "string");
  const content = hasImages
    ? contentParts.map((part) =>
        typeof part === "string" ? { type: "text", text: part } : part,
      )
    : contentParts.length > 0
      ? contentParts.join("")
      : undefined;

  const json =
    jsonParts.length === 0
      ? undefined
      : jsonParts.length === 1
        ? jsonParts[0]
        : jsonParts;

  const hasMainMessage =
    content !== undefined ||
    thinking.length > 0 ||
    redactedThinking.length > 0 ||
    toolCalls.length > 0 ||
    json !== undefined;

  const mainMessage = hasMainMessage
    ? ({
        role: message.role,
        // `senderName` is deliberately not mapped to ChatML `name`: the
        // renderer titles messages name-over-role, and this view titles by
        // role.
        ...(content !== undefined ? { content } : {}),
        ...(thinking.length > 0 ? { thinking } : {}),
        ...(redactedThinking.length > 0
          ? { redacted_thinking: redactedThinking }
          : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        ...(json !== undefined ? { json } : {}),
      } as ChatMlMessage)
    : undefined;

  // Tool results stay parts here: toIOPreview pairs them into their call
  // entries across messages before the leftovers become standalone messages.
  return {
    main: mainMessage,
    toolCallEntries: toolCalls,
    toolResultParts: toolResults,
  };
}

/**
 * Projects normalized I/O into the existing ChatML-shaped preview contract.
 * This is intentionally a web-only compatibility layer; the normalized parser
 * remains independent of React and the current rendering components.
 */
export function toIOPreview(
  io: NormalizedIO,
  parsedInput: unknown,
): ChatMLParserResult {
  const projected = io.messages.map((message) => ({
    source: message.source,
    ...toChatMessages(message),
  }));

  // Pair tool results into their call entries by id (calls and results can
  // live in different messages). First call with an id wins; a result whose
  // id is unknown or already answered stays a standalone tool message, so
  // nothing is ever dropped.
  const callEntryById = new Map<
    string,
    ProjectedMessage["toolCallEntries"][number]
  >();
  for (const { toolCallEntries } of projected) {
    for (const entry of toolCallEntries) {
      if (entry.id && !callEntryById.has(entry.id)) {
        callEntryById.set(entry.id, entry);
      }
    }
  }

  const projectedMessages = projected.map(
    ({ source, main, toolResultParts }) => {
      const standaloneResults = toolResultParts.filter((part) => {
        const entry = part.toolCallId
          ? callEntryById.get(part.toolCallId)
          : undefined;
        if (!entry || entry.response !== null) return true;
        entry.response = {
          output: part.output,
          ...(part.isError !== undefined ? { isError: part.isError } : {}),
        };
        return false;
      });
      return {
        source,
        messages: [
          ...(main ? [main] : []),
          ...standaloneResults.map(toToolResultMessage),
        ],
      };
    },
  );
  const allMessages = projectedMessages.flatMap(({ messages }) => messages);
  const inputMessageCount = projectedMessages.reduce(
    (count, { source, messages }) =>
      count + (source === "input" ? messages.length : 0),
    0,
  );
  const bookkeeping = computeToolCallBookkeeping(
    allMessages,
    inputMessageCount,
    io.toolDefinitions.map(toToolDefinition),
  );

  return {
    canDisplayAsChat: allMessages.length > 0,
    allMessages,
    // computes additionalInput via the legacy extractAdditionalInput(parsedInput) helper, which strips
    // only the top-level keys the OLD provider adapters used to populate. This projection must be
    // updated to manage only the keys that are additional in the context of the new provider adapters.
    additionalInput: extractAdditionalInput(parsedInput),
    inputMessageCount,
    ...bookkeeping,
  };
}
