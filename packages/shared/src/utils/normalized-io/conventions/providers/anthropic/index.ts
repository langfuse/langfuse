import { claimed, unmatched } from "../..";
import {
  asRecord,
  compact,
  optionalString,
  toJsonValue,
  toProviderMetadata,
} from "../../../core/utils/json";
import {
  filePartFromUrl,
  type UrlFilePartOptions,
} from "../../../core/normalize/message-parts/media";
import { reasoningPart } from "../../../core/normalize/message-parts/reasoning";
import {
  providerExecutedToolCall,
  toolCallPart,
} from "../../../core/normalize/message-parts/tool-calls";
import { toolResultPart } from "../../../core/normalize/message-parts/tool-results";
import {
  toolDefinition,
  toolDefinitionProviderMetadata,
} from "../../../core/normalize/tool-definitions";
import type { FilePart, FinishReason } from "../../../types";
import type {
  IOConvention,
  PartHandler,
  MessageSource,
} from "../../io-convention";

/**
 * Anthropic Messages API convention: this module owns Anthropic's typed
 * block vocabulary, its `system` request field, and the `thinking` sibling
 * array. One message can still contain parts from several dialects — the
 * core folds every provider cumulatively.
 */

// Anthropic `stop_reason` vocabulary -> the canonical FinishReason set.
const ANTHROPIC_FINISH_REASON_TYPE_BY_RAW: Record<
  string,
  FinishReason["type"]
> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  tool_use: "tool-calls",
  refusal: "content-filter",
  pause_turn: "other",
};

const ANTHROPIC_TOOL_RESULT_PART_TYPES = [
  "tool_result",
  "web_search_tool_result",
  "code_execution_tool_result",
  "bash_code_execution_result",
  "text_editor_code_execution_tool_result",
  "text_editor_code_execution_view_result",
  "mcp_tool_result",
];

/** Anthropic `source` objects: `{type: "base64" | "url" | "file", ...}`. */
function filePartFromAnthropicSource(
  source: Record<string, unknown>,
  options: Omit<UrlFilePartOptions, "mediaType"> & {
    extras?: Record<string, unknown>;
  } = {},
): FilePart | null {
  const mediaType = optionalString(source.media_type);

  const url = optionalString(source.url);
  if (source.type === "url" && url) {
    return filePartFromUrl(url, { ...options, mediaType });
  }

  const data = optionalString(source.data);
  const fileId = optionalString(source.file_id);
  const content: FilePart["content"] | undefined =
    source.type === "base64" && data
      ? { kind: "base64", data }
      : source.type === "file" && fileId
        ? { kind: "reference", id: fileId }
        : undefined;
  if (!content) return null;

  return compact<FilePart>({
    type: "file",
    mediaType: mediaType ?? options.fallbackMediaType,
    content,
    providerMetadata: options.extras
      ? toProviderMetadata(options.extras)
      : undefined,
  });
}

const normalizeAnthropicImage: PartHandler = (value) => {
  // Anthropic image blocks carry a `source`; source-less `image` parts on
  // the same type name belong to the AI SDK dialect and fall through.
  const source = asRecord(value.source);
  if (!source) return unmatched;
  const part = filePartFromAnthropicSource(source, {
    fallbackMediaType: "image/*",
  });
  return part ? claimed(part) : unmatched;
};

// Anthropic call blocks: { type, id, name, input }. Streamed emissions
// also carry the content-block `index` — it stays in providerMetadata.
const anthropicToolCall = (value: Record<string, unknown>, toolType?: string) =>
  toolCallPart({
    toolCallId: value.id,
    toolName: value.name,
    input: value.input,
    toolType,
  });

const normalizeAnthropicServerToolCall: PartHandler = (value) =>
  claimed(
    providerExecutedToolCall(anthropicToolCall(value, "server_tool_use")),
  );

const normalizeAnthropicMcpToolCall: PartHandler = (value) =>
  claimed(
    providerExecutedToolCall(
      anthropicToolCall(value, "mcp_tool_use"),
      compact({ server_name: optionalString(value.server_name) }),
    ),
  );

const normalizeAnthropicThinking: PartHandler = (value) =>
  claimed(reasoningPart(value.thinking, optionalString(value.signature)));

const normalizeAnthropicRedactedThinking: PartHandler = (value) => {
  const data = optionalString(value.data);
  return data
    ? claimed({ type: "reasoning", content: { kind: "redacted", data } })
    : claimed(reasoningPart(value.data ?? null));
};

const normalizeAnthropicDocument: PartHandler = (value) => {
  const source = asRecord(value.source);
  const part = source
    ? filePartFromAnthropicSource(source, {
        extras: compact({
          title: optionalString(value.title),
          context: optionalString(value.context),
          citations: Array.isArray(value.citations)
            ? value.citations
            : undefined,
        }),
      })
    : null;
  if (part) return claimed(part);

  // Text and structured-content documents are semantic content, but do not
  // have a file reference that a renderer can resolve.
  return claimed({
    type: "custom",
    kind: "document",
    value: toJsonValue(value),
  });
};

const normalizeAnthropicContainerUpload: PartHandler = (value) => {
  const fileId = optionalString(value.file_id);
  if (!fileId) return unmatched;
  // Opaque reference: no media-type signal (README assumption 11).
  return claimed({ type: "file", content: { kind: "reference", id: fileId } });
};

// Anthropic result blocks: { type: "tool_result" | "*_tool_result",
// tool_use_id, content, is_error? }.
const normalizeAnthropicToolResult: PartHandler = (value) =>
  claimed(
    toolResultPart({
      toolCallId: value.tool_use_id ?? value.id,
      output: value.content,
      isError: typeof value.is_error === "boolean" ? value.is_error : undefined,
    }),
  );

const ANTHROPIC_PART_HANDLERS = {
  tool_use: (value) => claimed(anthropicToolCall(value, "tool_use")),
  image: normalizeAnthropicImage,
  server_tool_use: normalizeAnthropicServerToolCall,
  mcp_tool_use: normalizeAnthropicMcpToolCall,
  thinking: normalizeAnthropicThinking,
  redacted_thinking: normalizeAnthropicRedactedThinking,
  document: normalizeAnthropicDocument,
  container_upload: normalizeAnthropicContainerUpload,
  ...Object.fromEntries(
    ANTHROPIC_TOOL_RESULT_PART_TYPES.map((type) => [
      type,
      normalizeAnthropicToolResult,
    ]),
  ),
} satisfies Readonly<Record<string, PartHandler>>;

/**
 * Anthropic's `system` request field: a string or content-block array,
 * carried beside `content` rather than in the message stream. Wrapped as
 * message content and forced to the system role.
 */
function anthropicSystemMessage(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource | undefined {
  if (kind !== "input" || !("system" in root)) return undefined;
  return {
    kind: "single",
    value: { content: root.system },
    fallbackRole: "user",
    roleOverride: "system",
  };
}

// Anthropic carries citations under `citations` on text parts and document
// sources.
const ANTHROPIC_CITATION_KEYS = new Set(["citations"]);

export const anthropicProvider = {
  name: "anthropic",
  finishReasonTypeByRaw: ANTHROPIC_FINISH_REASON_TYPE_BY_RAW,
  typedParts: ANTHROPIC_PART_HANDLERS,
  citationKeys: ANTHROPIC_CITATION_KEYS,
  // Anthropic tool declarations: { name, description, input_schema }.
  tryNormalizeToolDefinition: (value: Record<string, unknown>) => {
    if (value.input_schema === undefined) return unmatched;
    const definition = toolDefinition({
      name: value.name,
      description: value.description,
      inputSchema: value.input_schema,
      type: value.type,
      providerMetadata: toolDefinitionProviderMetadata(value, value),
    });
    return definition ? claimed(definition) : unmatched;
  },
  collectSiblingParts: (
    value: Record<string, unknown>,
    _baseParts,
    context,
  ) => {
    const parts = context.normalizePartList(
      Array.isArray(value.thinking) ? value.thinking : [],
    );
    return parts.length > 0
      ? [{ sourceKey: "thinking", slot: "after-content", parts }]
      : [];
  },
  getSystemMessage: anthropicSystemMessage,
} satisfies IOConvention;
