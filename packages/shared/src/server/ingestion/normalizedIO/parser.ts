import type { EventRecordBaseType } from "../../repositories/definitions";
import { metadataArraysToRecord } from "../../utils/metadata_conversion";
import type { ResourceSpan } from "../../otel/OtelIngestionProcessor";
import {
  MEDIA_REFERENCE_PATTERN,
  MediaReferenceStringSchema,
} from "../../../utils/IORepresentation/chatML/types";
import type {
  FilePart,
  JsonObject,
  JsonValue,
  NormalizedIO,
  NormalizedMessage,
  NormalizedMessagePart,
  NormalizedMessageRole,
  SpanIO,
  ToolCallPart,
  ToolDefinition,
} from "./types";

type OtelScopeSpan = NonNullable<ResourceSpan["scopeSpans"]>[number];
export type OtelSpan = NonNullable<OtelScopeSpan["spans"]>[number];
export type OtelScope = OtelScopeSpan["scope"];

export type OtelSpanContext = {
  // The full instrumentation scope: name drives format detection, and
  // name/version/attributes all flow into SpanIO metadata.
  scope: OtelScope;
  resourceAttributes: Record<string, unknown>;
};

type EventRecordIOColumns = Pick<
  EventRecordBaseType,
  "input" | "output" | "metadata_names" | "metadata_values"
>;

export type NormalizeIOSource =
  | { kind: "event-record"; record: EventRecordIOColumns }
  | { kind: "io"; io: SpanIO }
  | { kind: "otel"; span: OtelSpan; context: OtelSpanContext };

type ParsedIOValue = {
  value: unknown;
  record?: Record<string, unknown>;
  messages?: unknown[];
};

type ParsedSpanIO = {
  input: ParsedIOValue;
  output: ParsedIOValue;
  metadata: unknown;
};

type NormalizedIOAccumulator = {
  messages: NormalizedMessage[];
  toolDefinitions: ToolDefinition[];
  toolDefinitionIndexByName: Map<string, number>;
  toolCallKeys: Record<"input" | "output", Set<string>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        toJsonValue(nestedValue),
      ]),
    );
  }

  // Telemetry values should already be JSON-compatible. Preserve an explicit
  // fallback instead of dropping an unexpected value from the custom part.
  return value === undefined ? null : String(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Parse one JSON-string boundary. Nested values are parsed only by their owner. */
function parseIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function parseRecord(value: unknown): Record<string, unknown> | undefined {
  return asRecord(parseIfString(value));
}

function parseArray(value: unknown): unknown[] | undefined {
  const parsed = parseIfString(value);
  return Array.isArray(parsed) ? parsed : undefined;
}

function toProviderMetadata(
  entries: Record<string, unknown>,
): JsonObject | undefined {
  const value = toJsonValue(entries);
  return isRecord(value) && Object.keys(value).length > 0 ? value : undefined;
}

type ParsedMediaReference = {
  type: string;
  id: string;
  source: string;
  referenceString: string;
};

/**
 * Whole-string `@@@langfuseMedia:type=X|id=Y|source=Z@@@` reference tokens —
 * the shape stored IO carries after ingestion has replaced raw media payloads.
 * Strings that merely contain a token (or several) stay text; splitting
 * mid-string remains the renderer's concern.
 */
function parseMediaReference(value: unknown): ParsedMediaReference | undefined {
  if (typeof value !== "string") return undefined;

  const matches = value.match(MEDIA_REFERENCE_PATTERN) ?? [];
  if (matches.length !== 1 || matches[0] !== value) return undefined;

  const parsed = MediaReferenceStringSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function filePartFromMediaReference(
  reference: ParsedMediaReference,
  extras?: Record<string, unknown>,
): FilePart {
  const providerMetadata = toProviderMetadata({
    source: reference.source,
    ...extras,
  });

  return {
    type: "file",
    mediaType: reference.type,
    content: { kind: "reference", id: reference.id },
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

/**
 * Split a string into interleaved text and file parts, one file part per
 * embedded media reference token — strings frequently carry several.
 * Whitespace-only separators between tokens are dropped; kept text segments
 * preserve their original spacing.
 */
function normalizePartsFromString(value: string): NormalizedMessagePart[] {
  const parts: NormalizedMessagePart[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MEDIA_REFERENCE_PATTERN)) {
    const parsed = MediaReferenceStringSchema.safeParse(match[0]);
    if (!parsed.success) continue; // stays part of the surrounding text

    const before = value.slice(lastIndex, match.index);
    if (before.trim().length > 0) parts.push({ type: "text", text: before });
    parts.push(filePartFromMediaReference(parsed.data));
    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return [{ type: "text", text: value }];

  const rest = value.slice(lastIndex);
  if (rest.trim().length > 0) parts.push({ type: "text", text: rest });
  return parts;
}

/**
 * OpenAI file fields (`file` content parts and Responses `input_file` items
 * share them): base64 `file_data` (possibly a media token), a `file_url`, or
 * an opaque `file_id` reference, plus an optional `filename`.
 */
function filePartFromFileFields(
  fields: Record<string, unknown>,
): FilePart | null {
  const filename = optionalString(fields.filename);
  const withName = filename ? { filename } : {};

  const fileData = optionalString(fields.file_data);
  const reference = parseMediaReference(fileData);
  if (reference) {
    return { ...filePartFromMediaReference(reference), ...withName };
  }
  if (fileData) {
    return {
      type: "file",
      ...withName,
      content: { kind: "base64", data: fileData },
    };
  }

  const fileUrl = optionalString(fields.file_url);
  if (fileUrl) {
    return {
      type: "file",
      ...withName,
      content: { kind: "url", url: fileUrl },
    };
  }

  const fileId = optionalString(fields.file_id);
  if (fileId) {
    return {
      type: "file",
      ...withName,
      content: { kind: "reference", id: fileId },
    };
  }

  return null;
}

/**
 * Read the media type a data-URI declares in its prefix, without touching the
 * payload. Raw data-URIs only reach stored IO when upstream media processing
 * (SDK / MediaPayloadProcessor) skipped or failed; decoding them stays the
 * media pipeline's job.
 */
function mediaTypeFromDataUri(url: string): string | undefined {
  if (!url.startsWith("data:")) return undefined;
  const end = url.slice(5).search(/[;,]/);
  return end > 0 ? url.slice(5, 5 + end) : undefined;
}

function imageFilePartFromUrl(
  url: string,
  providerMetadata?: Record<string, unknown>,
): FilePart {
  const reference = parseMediaReference(url);
  if (reference) return filePartFromMediaReference(reference, providerMetadata);

  return {
    type: "file",
    mediaType: mediaTypeFromDataUri(url) ?? "image/*",
    content: { kind: "url", url },
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

function omitKeys(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}

function parseIOValue(value: unknown): ParsedIOValue {
  const parsed = parseIfString(value);
  const record = asRecord(parsed);

  return {
    value: parsed,
    record,
    messages: Array.isArray(parsed)
      ? parsed
      : record
        ? parseArray(record.messages)
        : undefined,
  };
}

function parseSpanIO(span: SpanIO): ParsedSpanIO {
  return {
    input: parseIOValue(span.input),
    output: parseIOValue(span.output),
    metadata: parseIfString(span.metadata),
  };
}

/**
 * OTel span -> SpanIO, one span (= one observation) at a time.
 *
 * Framework-specific extraction is intentionally still a follow-up. The
 * ingestion processor remains the source of truth until that logic is moved
 * behind this private helper.
 */
function spanIOFromOtelSpan(_span: OtelSpan, _ctx: OtelSpanContext): SpanIO {
  throw new Error("spanIOFromOtelSpan is not implemented yet");
}

function toSpanIO(source: NormalizeIOSource): SpanIO {
  switch (source.kind) {
    case "event-record":
      return {
        input: source.record.input ?? null,
        output: source.record.output ?? null,
        metadata:
          metadataArraysToRecord(
            source.record.metadata_names,
            source.record.metadata_values,
          ) ?? null,
      };
    case "io":
      return source.io;
    case "otel":
      return spanIOFromOtelSpan(source.span, source.context);
  }
}

function createAccumulator(): NormalizedIOAccumulator {
  return {
    messages: [],
    toolDefinitions: [],
    toolDefinitionIndexByName: new Map(),
    toolCallKeys: { input: new Set(), output: new Set() },
  };
}

function getToolCallKey(part: NormalizedMessagePart): string | undefined {
  if (part.type !== "tool-call") return undefined;

  const id = part.toolCallId;
  if (typeof id === "string" && id.length > 0) return `id:${id}`;

  try {
    return `value:${String(part.toolName)}:${JSON.stringify(part.input)}`;
  } catch {
    return undefined;
  }
}

function addMessage(
  accumulator: NormalizedIOAccumulator,
  message: NormalizedMessage,
): void {
  // Dedup tool calls within one source only. A call echoed across the
  // input/output boundary is kept on both sides: the trace IO view renders
  // it in both places, and the tool columns must count a call that appears
  // in this observation's output even when the input echoes it.
  const seenKeys = accumulator.toolCallKeys[message.source];
  const parts = message.parts.filter((part) => {
    const key = getToolCallKey(part);
    if (!key) return true;
    if (seenKeys.has(key)) return false;

    seenKeys.add(key);
    return true;
  });

  if (parts.length > 0) {
    accumulator.messages.push({ ...message, parts });
  }
}

function addToolDefinition(
  accumulator: NormalizedIOAccumulator,
  definition: ToolDefinition,
): void {
  const existingIndex = accumulator.toolDefinitionIndexByName.get(
    definition.name,
  );

  if (existingIndex === undefined) {
    accumulator.toolDefinitionIndexByName.set(
      definition.name,
      accumulator.toolDefinitions.length,
    );
    accumulator.toolDefinitions.push(definition);
    return;
  }

  const existing = accumulator.toolDefinitions[existingIndex];
  if (!existing) return;

  accumulator.toolDefinitions[existingIndex] = {
    name: existing.name,
    description: existing.description ?? definition.description,
    inputSchema: existing.inputSchema ?? definition.inputSchema,
    type: existing.type ?? definition.type,
    providerMetadata:
      existing.providerMetadata && definition.providerMetadata
        ? { ...definition.providerMetadata, ...existing.providerMetadata }
        : (existing.providerMetadata ?? definition.providerMetadata),
  };
}

function normalizeToolCall(
  value: unknown,
  options: { toolType?: string } = {},
): ToolCallPart | null {
  if (!isRecord(value)) return null;

  const functionCall = asRecord(value.function);
  const toolName = value.toolName ?? value.name ?? functionCall?.name;
  if (typeof toolName !== "string" || toolName.length === 0) return null;

  const rawInput =
    value.input ??
    value.arguments ??
    value.args ??
    functionCall?.arguments ??
    {};

  return {
    type: "tool-call",
    toolCallId: nullableString(value.toolCallId ?? value.call_id ?? value.id),
    toolName,
    input: toJsonValue(parseIfString(rawInput)),
    ...(options.toolType ? { toolType: options.toolType } : {}),
    ...(typeof value.index === "number" ? { index: value.index } : {}),
    ...(typeof value.providerExecuted === "boolean"
      ? { providerExecuted: value.providerExecuted }
      : {}),
  };
}

/**
 * OpenAI Responses built-in (provider-executed) tool items. They carry no
 * `name`/`arguments`; the item type is the tool. Kind-specific payloads
 * (action, queries, code, results, ...) travel in `input` unsplit — the API
 * reports request and result on the same item.
 */
const RESPONSES_BUILT_IN_TOOL_ITEM_TYPES = new Set([
  "web_search_call",
  "file_search_call",
  "code_interpreter_call",
  "computer_call",
  "image_generation_call",
  "local_shell_call",
  "shell_call",
  "apply_patch_call",
  "tool_search_call",
]);

function normalizeBuiltInToolItem(
  value: Record<string, unknown>,
): ToolCallPart | null {
  const type = typeof value.type === "string" ? value.type : undefined;
  if (!type) return null;

  if (type === "mcp_call") {
    // MCP calls are real named calls that happen to be provider-executed;
    // server_label/output/error ride in providerMetadata.
    const part = normalizeToolCall(value, { toolType: type });
    if (!part) return null;
    const providerMetadata = toProviderMetadata(
      omitKeys(value, ["id", "call_id", "type", "name", "arguments", "status"]),
    );
    return {
      ...part,
      providerExecuted: true,
      ...(providerMetadata ? { providerMetadata } : {}),
    };
  }

  if (!RESPONSES_BUILT_IN_TOOL_ITEM_TYPES.has(type)) return null;

  const status = optionalString(value.status);
  return {
    type: "tool-call",
    toolCallId: nullableString(value.call_id ?? value.id),
    toolName: type.replace(/_call$/, ""),
    input: toJsonValue(omitKeys(value, ["id", "call_id", "type", "status"])),
    toolType: type,
    providerExecuted: true,
    ...(status ? { providerMetadata: { status } } : {}),
  };
}

function normalizeMessagePart(value: unknown): NormalizedMessagePart | null {
  if (typeof value === "string") {
    const mediaReference = parseMediaReference(value);
    if (mediaReference) return filePartFromMediaReference(mediaReference);
    return { type: "text", text: value };
  }
  if (!isRecord(value)) return null;

  const builtInToolCall = normalizeBuiltInToolItem(value);
  if (builtInToolCall) return builtInToolCall;

  const functionCall =
    asRecord(value.function_call) ?? asRecord(value.functionCall);
  if (functionCall) {
    return normalizeToolCall({
      ...functionCall,
      id: functionCall.id ?? value.id,
    });
  }

  const functionResponse =
    asRecord(value.function_response) ?? asRecord(value.functionResponse);
  if (functionResponse) {
    return {
      type: "tool-result",
      toolCallId: nullableString(
        functionResponse.id ?? functionResponse.name ?? value.id,
      ),
      output: toJsonValue(
        parseIfString(
          functionResponse.response ?? functionResponse.output ?? null,
        ),
      ),
    };
  }

  if (isToolCallLike(value)) return normalizeToolCall(value);

  switch (value.type) {
    case "text":
    case "input_text":
    case "output_text": {
      const text = optionalString(value.text ?? value.content) ?? "";
      if (value.thought === true) return { type: "reasoning", text };
      // Responses API carries citation annotations per text part.
      const annotations =
        Array.isArray(value.annotations) && value.annotations.length > 0
          ? toJsonValue(value.annotations)
          : undefined;
      return {
        type: "text",
        text,
        ...(annotations ? { providerMetadata: { annotations } } : {}),
      };
    }
    case "reasoning":
    case "thinking":
    case "reasoning_text":
    case "summary_text": {
      const reasoning =
        value.text ?? value.content ?? value.thinking ?? value.summary;
      return typeof reasoning === "string"
        ? { type: "reasoning", text: reasoning }
        : { type: "reasoning", data: toJsonValue(reasoning) };
    }
    case "tool_call":
    case "tool-call":
    case "tool_use":
    case "function_call":
      return normalizeToolCall(value);
    case "custom_tool_call":
      // OpenAI Responses custom (free-form input) tool call.
      return normalizeToolCall(value, { toolType: "custom" });
    case "tool_call_response":
    case "function_call_output":
    case "custom_tool_call_output":
    case "computer_call_output":
    case "local_shell_call_output":
    case "tool-result":
    case "tool_result":
      return {
        type: "tool-result",
        toolCallId: nullableString(
          value.toolCallId ?? value.call_id ?? value.id,
        ),
        output: toJsonValue(
          parseIfString(
            value.output ??
              value.response ??
              value.result ??
              value.content ??
              null,
          ),
        ),
      };
    case "image_url": {
      const image = asRecord(value.image_url);
      const url = optionalString(image?.url);
      if (!url) break;
      const detail = optionalString(image?.detail);
      return imageFilePartFromUrl(url, detail ? { detail } : undefined);
    }
    case "input_image": {
      // OpenAI Responses image: flat fields instead of the chat wrapper.
      const detail = optionalString(value.detail);
      const providerMetadata = detail ? { detail } : undefined;
      const url = optionalString(value.image_url);
      if (url) return imageFilePartFromUrl(url, providerMetadata);
      const fileId = optionalString(value.file_id);
      if (fileId) {
        return {
          type: "file",
          mediaType: "image/*",
          content: { kind: "reference", id: fileId },
          ...(providerMetadata ? { providerMetadata } : {}),
        };
      }
      break;
    }
    case "input_audio": {
      const audio = asRecord(value.input_audio);
      const data = optionalString(audio?.data);
      if (!data) break;
      const reference = parseMediaReference(data);
      if (reference) return filePartFromMediaReference(reference);
      const format = optionalString(audio?.format);
      return {
        type: "file",
        mediaType: format ? `audio/${format}` : "audio/*",
        content: { kind: "base64", data },
      };
    }
    case "file": {
      const file = asRecord(value.file);
      const part = file ? filePartFromFileFields(file) : null;
      if (part) return part;
      break;
    }
    case "input_file": {
      // OpenAI Responses file: same fields as the chat `file` wrapper, flat.
      const part = filePartFromFileFields(value);
      if (part) return part;
      break;
    }
    case "refusal": {
      // Refusal text stays part of the conversation stream; the flag keeps
      // refusal observations findable (e.g. eval filters on providerMetadata).
      const refusal = optionalString(value.refusal);
      if (!refusal) break;
      return {
        type: "text",
        text: refusal,
        providerMetadata: { refusal: true },
      };
    }
    case "custom": {
      // OpenAI custom tool call: { id, type: "custom", custom: { name, input } }.
      const custom = asRecord(value.custom);
      if (!custom || !optionalString(custom.name) || !("input" in custom)) {
        break;
      }
      return normalizeToolCall(
        { id: value.id, name: custom.name, input: custom.input },
        { toolType: "custom" },
      );
    }
  }

  if (typeof value.type !== "string") {
    return { type: "data", value: toJsonValue(value) };
  }
  return {
    type: "custom",
    kind: value.type,
    value: toJsonValue(value),
  };
}

function normalizeRole(
  message: Record<string, unknown>,
): NormalizedMessageRole | undefined {
  const rawRole = message.role ?? message.author;
  if (typeof rawRole === "string") {
    const role = rawRole.toLowerCase();
    if (role === "model") return "assistant";
    // Deprecated OpenAI function-calling protocol: function messages are
    // tool results.
    if (role === "function") return "tool";
    if (["system", "developer", "user", "assistant", "tool"].includes(role)) {
      return role as NormalizedMessageRole;
    }
    return "unknown";
  }

  const roleByType: Record<string, NormalizedMessageRole> = {
    human: "user",
    ai: "assistant",
    tool: "tool",
    system: "system",
  };

  return typeof message.type === "string"
    ? roleByType[message.type]
    : undefined;
}

function isToolDefinitionMessage(message: Record<string, unknown>): boolean {
  const content = asRecord(message.content);
  return Boolean(
    message.role === "tool" &&
    content?.type === "function" &&
    content.function &&
    !message.tool_call_id,
  );
}

function appendParts(target: NormalizedMessagePart[], values: unknown[]): void {
  for (const value of values) {
    if (typeof value === "string") {
      target.push(...normalizePartsFromString(value));
      continue;
    }
    const part = normalizeMessagePart(value);
    if (!part) continue;
    // Text parts frequently embed media reference tokens mid-string; split
    // them out. Flagged text (refusal, thought) stays intact.
    if (part.type === "text" && !part.providerMetadata) {
      target.push(...normalizePartsFromString(part.text));
      continue;
    }
    target.push(part);
  }
}

function normalizeMessage(
  value: unknown,
  fallbackRole: "user" | "assistant",
  source: "input" | "output",
): NormalizedMessage | null {
  if (typeof value === "string") {
    if (value.length === 0) return null;
    const parts = normalizePartsFromString(value);
    return parts.length > 0 ? { role: fallbackRole, parts, source } : null;
  }
  if (!isRecord(value) || isToolDefinitionMessage(value)) return null;

  const semanticKernelContent = parseRecord(value["gen_ai.event.content"]);
  if (semanticKernelContent) {
    return normalizeMessage(
      asRecord(semanticKernelContent.message) ?? semanticKernelContent,
      fallbackRole,
      source,
    );
  }

  const directToolPart =
    isToolCallLike(value) || isToolResultLike(value)
      ? normalizeMessagePart(value)
      : null;
  if (directToolPart && !isMessageLike(value)) {
    return {
      role: directToolPart.type === "tool-result" ? "tool" : "assistant",
      parts: [directToolPart],
      source,
    };
  }

  const nestedContent = asRecord(value.content);
  let role =
    normalizeRole(value) ??
    (nestedContent ? normalizeRole(nestedContent) : undefined) ??
    // Responses reasoning items carry no role but are model output even when
    // replayed on the input side.
    (value.type === "reasoning" ? "assistant" : fallbackRole);
  const parts: NormalizedMessagePart[] = [];

  // Deprecated OpenAI function-calling protocol: the result message carries
  // the function name instead of a tool_call_id.
  const isLegacyFunctionMessage =
    typeof value.role === "string" && value.role.toLowerCase() === "function";

  if (role === "tool" && (value.tool_call_id || isLegacyFunctionMessage)) {
    parts.push({
      type: "tool-result",
      toolCallId: nullableString(value.tool_call_id),
      ...(isLegacyFunctionMessage && optionalString(value.name)
        ? { toolName: String(value.name) }
        : {}),
      output: toJsonValue(parseIfString(value.content ?? null)),
    });
  } else {
    const rawParts = Array.isArray(value.parts)
      ? value.parts
      : Array.isArray(value.content)
        ? value.content
        : Array.isArray(nestedContent?.parts)
          ? nestedContent.parts
          : undefined;
    if (rawParts) {
      appendParts(parts, rawParts);
    } else if (typeof value.content === "string" && value.content.length > 0) {
      parts.push(...normalizePartsFromString(value.content));
    } else if (isRecord(value.content)) {
      const part = normalizeMessagePart(value.content);
      if (part) parts.push(part);
    }
  }

  const thinking = Array.isArray(value.thinking) ? value.thinking : [];
  appendParts(parts, thinking);

  const toolCalls =
    parseArray(value.tool_calls) ?? parseArray(value.toolCalls) ?? [];
  appendParts(parts, toolCalls);

  const additionalKwargs = asRecord(value.additional_kwargs);
  appendParts(parts, parseArray(additionalKwargs?.tool_calls) ?? []);

  // OpenAI fields that live beside `content` on assistant/response messages.
  const refusal = optionalString(value.refusal);
  if (refusal) {
    parts.push({
      type: "text",
      text: refusal,
      providerMetadata: { refusal: true },
    });
  }

  const audioPart = normalizeAudioOutput(asRecord(value.audio));
  if (audioPart) parts.push(audioPart);

  const annotations = parseArray(value.annotations);
  if (annotations && annotations.length > 0) {
    // OpenAI chat annotations index into the message text, so they belong on
    // the text part rather than the message.
    const textPart = parts.find((part) => part.type === "text");
    if (textPart) {
      textPart.providerMetadata = {
        ...textPart.providerMetadata,
        annotations: toJsonValue(annotations),
      };
    }
  }

  if (
    role === "user" &&
    parts.length > 0 &&
    parts.every((part) => part.type === "tool-result")
  ) {
    role = "tool";
  }

  if (value.type === "reasoning") {
    // A reasoning item's content[] is collected via the regular parts path;
    // summary is a sibling stream and must be collected either way.
    const reasoningValues = (
      parts.length === 0 ? [value.summary, value.content] : [value.summary]
    )
      .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
      .filter((entry) => entry !== undefined && entry !== null);
    appendParts(parts, reasoningValues);

    const encryptedContent = optionalString(value.encrypted_content);
    if (encryptedContent) {
      const reasoningPart = parts.find((part) => part.type === "reasoning");
      if (reasoningPart) {
        reasoningPart.providerMetadata = {
          ...reasoningPart.providerMetadata,
          encrypted_content: encryptedContent,
        };
      } else {
        parts.push({
          type: "reasoning",
          providerMetadata: { encrypted_content: encryptedContent },
        });
      }
    }
  }

  return parts.length > 0
    ? {
        ...(optionalString(value.id) ? { id: String(value.id) } : {}),
        // Legacy function messages consume `name` as the tool name; it is not
        // a participant name there.
        ...(!isLegacyFunctionMessage && optionalString(value.name)
          ? { name: String(value.name) }
          : {}),
        role,
        parts,
        source,
      }
    : null;
}

/**
 * OpenAI audio output (`message.audio`): `{ id, data, transcript, expires_at }`
 * on response messages, `{ id }` as the request-side reference. The playable
 * payload becomes the file part; transcript and the remaining fields ride
 * along in providerMetadata so the stream stays renderable media-first.
 */
function normalizeAudioOutput(
  audio: Record<string, unknown> | undefined,
): FilePart | null {
  if (!audio) return null;

  const { data, ...extras } = audio;
  const payload = optionalString(data);

  const reference = parseMediaReference(payload);
  if (reference) return filePartFromMediaReference(reference, extras);

  if (payload) {
    const providerMetadata = toProviderMetadata(extras);
    return {
      type: "file",
      mediaType: "audio/*",
      content: { kind: "base64", data: payload },
      ...(providerMetadata ? { providerMetadata } : {}),
    };
  }

  const id = optionalString(audio.id);
  if (!id) return null;
  const providerMetadata = toProviderMetadata(
    Object.fromEntries(Object.entries(extras).filter(([key]) => key !== "id")),
  );
  return {
    type: "file",
    mediaType: "audio/*",
    content: { kind: "reference", id },
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

function isMessageLike(value: Record<string, unknown>): boolean {
  return [
    "role",
    "content",
    "parts",
    "tool_calls",
    "toolCalls",
    "additional_kwargs",
  ].some((key) => key in value);
}

function isToolCallLike(value: Record<string, unknown>): boolean {
  if (value.type === "tool-result") return false;

  const functionCall = asRecord(value.function);
  const hasOpenAiShape = Boolean(
    functionCall?.name && "arguments" in functionCall,
  );
  const hasAiSdkShape = Boolean(
    value.toolName &&
    (value.type === "tool-call" ||
      value.type === "tool_call" ||
      "input" in value ||
      "args" in value),
  );
  const hasResponsesShape = Boolean(
    value.call_id && value.name && "arguments" in value,
  );
  const hasAnthropicShape = Boolean(
    value.type === "tool_use" && value.name && "input" in value,
  );
  const hasToolCallMarker =
    "id" in value ||
    "index" in value ||
    [
      "function",
      "function_call",
      "tool-call",
      "tool_call",
      "tool_use",
    ].includes(String(value.type));
  const hasFlatShape = Boolean(
    value.name && "arguments" in value && hasToolCallMarker,
  );

  return (
    hasOpenAiShape ||
    hasAiSdkShape ||
    hasResponsesShape ||
    hasAnthropicShape ||
    hasFlatShape
  );
}

function isToolResultLike(value: Record<string, unknown>): boolean {
  return [
    "function_call_output",
    "custom_tool_call_output",
    "computer_call_output",
    "local_shell_call_output",
    "tool_call_response",
    "tool-result",
    "tool_result",
  ].includes(String(value.type));
}

function collectMessageArray(
  values: unknown[],
  fallbackRole: "user" | "assistant",
  source: "input" | "output",
  accumulator: NormalizedIOAccumulator,
): void {
  const standaloneToolCalls: NormalizedMessagePart[] = [];

  const flushStandaloneToolCalls = () => {
    if (standaloneToolCalls.length === 0) return;
    addMessage(accumulator, {
      role: "assistant",
      parts: standaloneToolCalls.splice(0),
      source,
    });
  };

  for (const value of values) {
    // Standalone tool-call items (Responses function_call, built-in
    // provider-executed calls, custom_tool_call) batch into one synthetic
    // assistant message until a non-call item flushes them.
    if (isRecord(value) && !isMessageLike(value)) {
      const part = normalizeMessagePart(value);
      if (part?.type === "tool-call") {
        standaloneToolCalls.push(part);
        continue;
      }
    }

    flushStandaloneToolCalls();
    const message = normalizeMessage(value, fallbackRole, source);
    if (message) addMessage(accumulator, message);
  }

  flushStandaloneToolCalls();
}

function collectMessages(
  parsedValue: ParsedIOValue,
  kind: "input" | "output",
  accumulator: NormalizedIOAccumulator,
): void {
  const fallbackRole = kind === "input" ? "user" : "assistant";
  const { value, record } = parsedValue;

  if (Array.isArray(value)) {
    collectMessageArray(
      parsedValue.messages ?? value,
      fallbackRole,
      kind,
      accumulator,
    );
    return;
  }

  if (!record) {
    const message = normalizeMessage(value, fallbackRole, kind);
    if (message) addMessage(accumulator, message);
    return;
  }

  let collectedNestedMessages = false;
  const messages = parsedValue.messages;
  if (messages) {
    collectMessageArray(messages, fallbackRole, kind, accumulator);
    collectedNestedMessages = true;
  }

  if (kind === "input" && "contents" in record) {
    const config = asRecord(record.config);
    const systemInstruction =
      config?.system_instruction ?? config?.systemInstruction;
    if (systemInstruction) {
      const message = normalizeMessage(systemInstruction, "user", kind);
      if (message) addMessage(accumulator, { ...message, role: "system" });
    }

    const contents = Array.isArray(record.contents)
      ? record.contents
      : [record.contents];
    collectMessageArray(contents, "user", kind, accumulator);
    collectedNestedMessages = true;
  }

  const newMessage = asRecord(record.new_message);
  if (kind === "input" && newMessage) {
    const message = normalizeMessage(newMessage, "user", kind);
    if (message) addMessage(accumulator, message);
    collectedNestedMessages = true;
  }

  const candidates = parseArray(record.candidates);
  if (kind === "output" && candidates) {
    for (const candidate of candidates) {
      const content = asRecord(candidate)?.content;
      const message = normalizeMessage(content, "assistant", kind);
      if (message) addMessage(accumulator, message);
    }
    collectedNestedMessages = true;
  }

  const choices = parseArray(record.choices);
  if (kind === "output" && choices) {
    for (const choice of choices) {
      const message = normalizeMessage(
        asRecord(choice)?.message,
        "assistant",
        kind,
      );
      if (message) addMessage(accumulator, message);
    }
    collectedNestedMessages = true;
  }

  const responseOutput = parseArray(record.output);
  if (kind === "output" && responseOutput) {
    collectMessageArray(responseOutput, "assistant", kind, accumulator);
    collectedNestedMessages = true;
  }

  if (isMessageLike(record) || isToolCallLike(record)) {
    const message = normalizeMessage(record, fallbackRole, kind);
    if (message) addMessage(accumulator, message);
  } else if (!collectedNestedMessages) {
    const message = normalizeMessage(record, fallbackRole, kind);
    if (message) addMessage(accumulator, message);
  }
}

function getProviderMetadata(
  wrapper: Record<string, unknown>,
  definition: Record<string, unknown>,
): JsonObject | undefined {
  const excluded = new Set([
    "name",
    "description",
    "desc",
    "parameters",
    "parameters_json_schema",
    "inputSchema",
    "format",
    "function",
    "custom",
    "type",
    "providerMetadata",
  ]);
  const inferred = Object.fromEntries(
    [...Object.entries(wrapper), ...Object.entries(definition)].filter(
      ([key]) => !excluded.has(key),
    ),
  );
  const explicit = asRecord(wrapper.providerMetadata);
  const providerMetadata = toJsonValue({ ...inferred, ...explicit });

  return isRecord(providerMetadata) && Object.keys(providerMetadata).length > 0
    ? providerMetadata
    : undefined;
}

function normalizeToolDefinition(
  value: unknown,
  options: { allowProviderToolWithoutName?: boolean } = {},
): ToolDefinition | null {
  if (!isRecord(value)) return null;

  // `function` wraps OpenAI function tools, `custom` wraps OpenAI custom
  // (free-form input) tools; everything else declares fields at the top level.
  const functionDefinition =
    asRecord(value.function) ?? asRecord(value.custom) ?? value;
  const rawName =
    functionDefinition.name ??
    value.name ??
    (options.allowProviderToolWithoutName
      ? (value.id ?? (value.type !== "function" ? value.type : undefined))
      : undefined);
  if (typeof rawName !== "string" || rawName.length === 0) return null;

  const rawDescription =
    functionDefinition.description ?? functionDefinition.desc;
  // `format` is the input constraint of OpenAI custom tools (text/grammar) —
  // it is the input schema, not provider trivia.
  const rawInputSchema =
    functionDefinition.inputSchema ??
    functionDefinition.parameters ??
    functionDefinition.parameters_json_schema ??
    functionDefinition.format;

  return {
    name: rawName,
    description:
      typeof rawDescription === "string" ? rawDescription : undefined,
    inputSchema:
      rawInputSchema === undefined
        ? undefined
        : toJsonValue(parseIfString(rawInputSchema)),
    type: typeof value.type === "string" ? value.type : undefined,
    providerMetadata: getProviderMetadata(value, functionDefinition),
  };
}

function collectToolDefinitionValue(
  value: unknown,
  accumulator: NormalizedIOAccumulator,
  options: {
    allowProviderToolWithoutName?: boolean;
    allowToolMap?: boolean;
  } = {},
): void {
  const parsed = parseIfString(value);

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const normalized = normalizeToolDefinition(parseIfString(item), options);
      if (normalized) addToolDefinition(accumulator, normalized);
    }
    return;
  }

  if (!isRecord(parsed)) return;

  const singleDefinition = normalizeToolDefinition(parsed, options);
  if (singleDefinition) {
    addToolDefinition(accumulator, singleDefinition);
    return;
  }

  if (!options.allowToolMap) return;

  // Some instrumentation exports definitions as a map keyed by tool name.
  for (const [name, rawDefinition] of Object.entries(parsed)) {
    const definition = parseRecord(rawDefinition);
    if (!definition) continue;

    const normalized = normalizeToolDefinition({ name, ...definition });
    if (normalized) addToolDefinition(accumulator, normalized);
  }
}

function collectGeminiToolDefinitions(
  config: unknown,
  accumulator: NormalizedIOAccumulator,
): void {
  const tools = parseArray(asRecord(config)?.tools);
  if (!tools) return;

  for (const tool of tools) {
    const toolGroup = asRecord(tool);
    const declarations =
      parseArray(toolGroup?.function_declarations) ??
      parseArray(toolGroup?.functionDeclarations);
    if (declarations) {
      collectToolDefinitionValue(declarations, accumulator, {
        allowToolMap: true,
      });
      continue;
    }

    collectToolDefinitionValue(tool, accumulator, {
      allowProviderToolWithoutName: true,
      allowToolMap: true,
    });
  }
}

function collectToolDefinitionsFromIO(
  parsedValue: ParsedIOValue,
  accumulator: NormalizedIOAccumulator,
): void {
  const root = parsedValue.record;
  if (root) {
    collectToolDefinitionValue(root.tools, accumulator, {
      allowProviderToolWithoutName: true,
      allowToolMap: true,
    });
    collectGeminiToolDefinitions(root.config, accumulator);
  }

  const messages = parsedValue.messages;
  if (!messages) return;

  for (const message of messages) {
    if (!isRecord(message)) continue;

    collectToolDefinitionValue(message.tools, accumulator, {
      allowProviderToolWithoutName: true,
      allowToolMap: true,
    });

    if (isToolDefinitionMessage(message)) {
      collectToolDefinitionValue(message.content, accumulator);
    }
  }
}

function collectMetadataToolDefinitions(
  metadata: unknown,
  accumulator: NormalizedIOAccumulator,
): void {
  const parsedMetadata = asRecord(metadata);
  if (!parsedMetadata) return;

  collectToolDefinitionValue(parsedMetadata.tools, accumulator);

  const attributes = parseRecord(parsedMetadata.attributes);
  if (!attributes) return;

  collectToolDefinitionValue(attributes["ai.prompt.tools"], accumulator, {
    allowProviderToolWithoutName: true,
    allowToolMap: true,
  });
  collectToolDefinitionValue(
    attributes["gen_ai.tool.definitions"],
    accumulator,
    { allowToolMap: true },
  );
  collectToolDefinitionValue(attributes.tools, accumulator);

  const modelRequestParameters = parseRecord(
    attributes.model_request_parameters,
  );
  collectToolDefinitionValue(
    modelRequestParameters?.function_tools,
    accumulator,
    { allowToolMap: true },
  );

  const indexedToolKeys = Object.keys(attributes)
    .map((key) => ({
      key,
      index: /^llm\.tools\.(\d+)\.tool\.json_schema$/.exec(key)?.[1],
    }))
    .filter(
      (entry): entry is { key: string; index: string } =>
        entry.index !== undefined,
    )
    .sort((left, right) => Number(left.index) - Number(right.index));

  for (const { key } of indexedToolKeys) {
    collectToolDefinitionValue(attributes[key], accumulator);
  }
}

export function normalizeIO(source: NormalizeIOSource): NormalizedIO {
  const span = toSpanIO(source);
  const { input, output, metadata } = parseSpanIO(span);
  const accumulator = createAccumulator();

  collectMessages(input, "input", accumulator);
  collectMessages(output, "output", accumulator);

  collectToolDefinitionsFromIO(input, accumulator);
  collectToolDefinitionsFromIO(output, accumulator);
  collectMetadataToolDefinitions(metadata, accumulator);

  return {
    messages: accumulator.messages,
    toolDefinitions: accumulator.toolDefinitions,
    span,
  };
}
