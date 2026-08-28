import { claimed, unmatched } from "../..";
import {
  asRecord,
  compact,
  nullableString,
  omitKeys,
  optionalString,
  parseArray,
  parseIfString,
  toJsonValue,
  toProviderMetadata,
} from "../../../core/utils/json";
import {
  filePartFromMediaReference,
  filePartFromUrl,
  parseMediaReference,
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
import type {
  FilePart,
  FinishReason,
  NormalizedMessage,
  NormalizedMessagePart,
  ToolCallPart,
} from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  PartHandler,
  MessageSource,
  SiblingPartContribution,
} from "../../io-convention";

/**
 * OpenAI convention: Chat Completions and Responses API shapes. This module
 * owns OpenAI's typed block vocabulary, its `choices`/`output` response
 * envelopes, and the `refusal`/`audio`/reasoning-item sibling fields.
 */

// OpenAI Chat Completions `finish_reason` vocabulary -> the canonical
// FinishReason set.
const OPENAI_FINISH_REASON_TYPE_BY_RAW: Record<string, FinishReason["type"]> = {
  stop: "stop",
  length: "length",
  tool_calls: "tool-calls",
  function_call: "tool-calls",
  content_filter: "content-filter",
};

/**
 * OpenAI Responses built-in (provider-executed) tool items. They carry no
 * `name`/`arguments`; the item type is the tool. Kind-specific payloads
 * (action, queries, code, results, ...) travel in `input` unsplit — the API
 * reports request and result on the same item.
 */
const RESPONSES_BUILT_IN_TOOL_ITEM_TYPES = [
  "web_search_call",
  "file_search_call",
  "code_interpreter_call",
  "computer_call",
  "image_generation_call",
  "local_shell_call",
  "shell_call",
  "apply_patch_call",
  "tool_search_call",
];

function normalizeBuiltInToolItem(
  value: Record<string, unknown>,
): ToolCallPart | null {
  const type = typeof value.type === "string" ? value.type : undefined;
  if (!type) return null;

  if (type === "mcp_call") {
    // MCP calls are real named calls that happen to be provider-executed;
    // server_label/output/error ride in providerMetadata.
    return providerExecutedToolCall(
      toolCallPart({
        toolCallId: value.call_id ?? value.id,
        toolName: value.name,
        input: value.arguments,
        toolType: type,
      }),
      omitKeys(value, ["id", "call_id", "type", "name", "arguments", "status"]),
    );
  }

  const status = optionalString(value.status);
  return compact<ToolCallPart>({
    type: "tool-call",
    toolCallId: nullableString(value.call_id ?? value.id),
    toolName: type.replace(/_call$/, ""),
    input: toJsonValue(omitKeys(value, ["id", "call_id", "type", "status"])),
    toolType: type,
    providerExecuted: true,
    providerMetadata: status ? { status } : undefined,
  });
}

// Chat Completions tool_calls entries ({ id, index?, function: { name,
// arguments } }) and Responses/legacy flat items ({ call_id | id, name,
// arguments }) share these two type names.
const normalizeOpenAiFunctionCall: PartHandler = (value) => {
  const functionCall = asRecord(value.function);
  return claimed(
    toolCallPart({
      toolCallId: value.call_id ?? value.id,
      toolName: value.name ?? functionCall?.name,
      input: value.arguments ?? functionCall?.arguments,
      toolType:
        optionalString(value.type) ?? (functionCall ? "function" : undefined),
    }),
  );
};

const normalizeOpenAiCustomToolCall: PartHandler = (value) => {
  // OpenAI custom tool call: { id, type: "custom", custom: { name, input } }.
  const custom = asRecord(value.custom);
  if (!custom || !optionalString(custom.name) || !("input" in custom)) {
    return unmatched;
  }
  return claimed(
    toolCallPart({
      toolCallId: value.id,
      toolName: custom.name,
      input: custom.input,
      toolType: "custom",
    }),
  );
};

const normalizeOpenAiImageUrl: PartHandler = (value) => {
  const image = asRecord(value.image_url);
  const url = optionalString(image?.url);
  if (!url) return unmatched;
  const detail = optionalString(image?.detail);
  const part = filePartFromUrl(url, {
    fallbackMediaType: "image/*",
    extras: detail ? { detail } : undefined,
  });
  return claimed(part);
};

const normalizeOpenAiInputImage: PartHandler = (value) => {
  // OpenAI Responses image: flat fields instead of the chat wrapper.
  const detail = optionalString(value.detail);
  const extras = detail ? { detail } : undefined;
  const url = optionalString(value.image_url);
  if (url) {
    return claimed(
      filePartFromUrl(url, { fallbackMediaType: "image/*", extras }),
    );
  }
  const fileId = optionalString(value.file_id);
  if (!fileId) return unmatched;
  return claimed(
    compact<FilePart>({
      type: "file",
      mediaType: "image/*",
      content: { kind: "reference", id: fileId },
      providerMetadata: extras ? toProviderMetadata(extras) : undefined,
    }),
  );
};

const normalizeOpenAiInputAudio: PartHandler = (value) => {
  const audio = asRecord(value.input_audio);
  const data = optionalString(audio?.data);
  if (!data) return unmatched;
  const reference = parseMediaReference(data);
  if (reference) return claimed(filePartFromMediaReference(reference));
  const format = optionalString(audio?.format);
  return claimed({
    type: "file",
    mediaType: format ? `audio/${format}` : "audio/*",
    content: { kind: "base64", data },
  });
};

/**
 * OpenAI file fields (`file` content parts and Responses `input_file` items
 * share them): base64 `file_data` (possibly a media token), a `file_url`, or
 * an opaque `file_id` reference, plus an optional `filename`.
 */
function filePartFromFileFields(
  fields: Record<string, unknown>,
): FilePart | null {
  const filename = optionalString(fields.filename);
  const fileData = optionalString(fields.file_data);
  const reference = parseMediaReference(fileData);
  if (reference) {
    return compact({ ...filePartFromMediaReference(reference), filename });
  }

  const fileUrl = optionalString(fields.file_url);
  const fileId = optionalString(fields.file_id);
  const content: FilePart["content"] | undefined = fileData
    ? { kind: "base64", data: fileData }
    : fileUrl
      ? { kind: "url", url: fileUrl }
      : fileId
        ? { kind: "reference", id: fileId }
        : undefined;
  if (!content) return null;

  return compact<FilePart>({ type: "file", filename, content });
}

const normalizeOpenAiFile: PartHandler = (value) => {
  // OpenAI chat `file` content parts wrap the fields under `file`; flat
  // `data`/`url` payloads on the same type name belong to the AI SDK
  // dialect and fall through.
  const file = asRecord(value.file);
  if (!file) return unmatched;
  const part = filePartFromFileFields(file);
  return part ? claimed(part) : unmatched;
};

const normalizeOpenAiInputFile: PartHandler = (value) => {
  // OpenAI Responses file: same fields as the chat `file` wrapper, flat.
  const part = filePartFromFileFields(value);
  return part ? claimed(part) : unmatched;
};

const normalizeOpenAiRefusal: PartHandler = (value) => {
  // Refusal text stays part of the conversation stream.
  const refusal = optionalString(value.refusal);
  return refusal
    ? claimed({ type: "text", refusal: true, text: refusal })
    : unmatched;
};

const normalizeOpenAiMcpCall: PartHandler = (value) => {
  const part = normalizeBuiltInToolItem(value);
  return part ? claimed(part) : unmatched;
};

const normalizeOpenAiBuiltInCall: PartHandler = (value) =>
  claimed(normalizeBuiltInToolItem(value));

// OpenAI Responses output items: { type: "*_output", call_id, output }.
const normalizeOpenAiToolResult: PartHandler = (value) =>
  claimed(
    toolResultPart({
      toolCallId: value.call_id ?? value.id,
      output: value.output,
    }),
  );

// OpenAI Responses custom (free-form input) tool call:
// { type: "custom_tool_call", call_id, name, input }.
const normalizeOpenAiResponsesCustomToolCall: PartHandler = (value) =>
  claimed(
    toolCallPart({
      toolCallId: value.call_id ?? value.id,
      toolName: value.name,
      input: value.input ?? value.arguments,
      toolType: "custom",
    }),
  );

// OpenAI Responses reasoning content/summary entries: { type, text }.
const normalizeOpenAiReasoningText: PartHandler = (value) =>
  claimed(reasoningPart(value.text));

const OPENAI_PART_HANDLERS = {
  function: normalizeOpenAiFunctionCall,
  function_call: normalizeOpenAiFunctionCall,
  custom_tool_call: normalizeOpenAiResponsesCustomToolCall,
  custom: normalizeOpenAiCustomToolCall,
  image_url: normalizeOpenAiImageUrl,
  input_image: normalizeOpenAiInputImage,
  input_audio: normalizeOpenAiInputAudio,
  file: normalizeOpenAiFile,
  input_file: normalizeOpenAiInputFile,
  refusal: normalizeOpenAiRefusal,
  reasoning_text: normalizeOpenAiReasoningText,
  summary_text: normalizeOpenAiReasoningText,
  mcp_call: normalizeOpenAiMcpCall,
  ...Object.fromEntries(
    RESPONSES_BUILT_IN_TOOL_ITEM_TYPES.map((type) => [
      type,
      normalizeOpenAiBuiltInCall,
    ]),
  ),
  function_call_output: normalizeOpenAiToolResult,
  custom_tool_call_output: normalizeOpenAiToolResult,
  computer_call_output: normalizeOpenAiToolResult,
  local_shell_call_output: normalizeOpenAiToolResult,
} satisfies Readonly<Record<string, PartHandler>>;

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
    return compact<FilePart>({
      type: "file",
      mediaType: "audio/*",
      content: { kind: "base64", data: payload },
      providerMetadata: toProviderMetadata(extras),
    });
  }

  const id = optionalString(audio.id);
  if (!id) return null;
  return compact<FilePart>({
    type: "file",
    mediaType: "audio/*",
    content: { kind: "reference", id },
    providerMetadata: toProviderMetadata(omitKeys(extras, ["id"])),
  });
}

/**
 * OpenAI message-sibling fields: `refusal`/`audio`, and Responses reasoning
 * items (content[] is collected via the regular parts path; `summary` is a
 * sibling stream collected either way, and the replayable `encrypted_content`
 * blob becomes its own stream element after the visible parts).
 */
function openAiCollectSiblingParts(
  value: Record<string, unknown>,
  baseParts: readonly NormalizedMessagePart[],
  context: { normalizePartList(values: unknown[]): NormalizedMessagePart[] },
): SiblingPartContribution[] {
  const parts: NormalizedMessagePart[] = [];

  const refusal = optionalString(value.refusal);
  if (refusal) parts.push({ type: "text", refusal: true, text: refusal });

  const audioPart = normalizeAudioOutput(asRecord(value.audio));
  if (audioPart) parts.push(audioPart);

  if (value.type === "reasoning") {
    const reasoningValues = (
      baseParts.length === 0 ? [value.summary, value.content] : [value.summary]
    )
      .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
      .filter((entry) => entry !== undefined && entry !== null);
    parts.push(...context.normalizePartList(reasoningValues));

    const encryptedContent = optionalString(value.encrypted_content);
    if (encryptedContent) {
      parts.push({
        type: "reasoning",
        content: { kind: "encrypted", data: encryptedContent },
      });
    }
  }

  return parts.length > 0
    ? [{ sourceKey: "openai.siblings", slot: "after-tool-calls", parts }]
    : [];
}

/**
 * OpenAI response envelopes: Chat Completions `choices[]` (finish reason
 * per choice) and Responses' `output[]` item array.
 */
function openAiMessages(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource[] {
  if (kind !== "output") return [];

  const choices = parseArray(root.choices);
  if (choices) {
    const sources: MessageSource[] = [];
    for (const choice of choices) {
      const choiceRecord = asRecord(choice);
      sources.push({
        kind: "single",
        value: choiceRecord?.message,
        fallbackRole: "assistant",
        // Chat Completions reports the finish reason on the choice, not the
        // message.
        finishReasonCarrier: choiceRecord,
      });
    }
    return sources;
  }

  const responseOutput = parseArray(root.output);
  if (
    responseOutput &&
    responseOutput.some((item) => {
      const record = asRecord(item);
      return Boolean(
        record?.type &&
        (String(record.type).includes("call") ||
          String(record.type).endsWith("_output") ||
          record.type === "message" ||
          record.type === "reasoning"),
      );
    })
  ) {
    return [
      {
        kind: "sequence",
        values: responseOutput,
        fallbackRole: "assistant",
      },
    ];
  }

  return [];
}

// OpenAI carries citations as `annotations` — per part on Responses
// output_text, message-level on Chat Completions.
const OPENAI_CITATION_KEYS = new Set(["annotations"]);

// Chat Completions carries assistant calls in a `tool_calls` sibling array.
const OPENAI_MESSAGE_LIKE_KEYS = new Set(["tool_calls"]);

/**
 * OpenAI tool declarations: function tools wrap their fields under
 * `function`; custom (free-form input) tools wrap under `custom` or declare
 * flat with `format` as the input schema (Responses).
 */
const tryNormalizeOpenAiToolDefinition = (value: Record<string, unknown>) => {
  const functionDefinition = asRecord(value.function);
  if (functionDefinition) {
    const definition = toolDefinition({
      name: functionDefinition.name ?? value.name,
      description: functionDefinition.description,
      inputSchema: functionDefinition.parameters,
      type: value.type,
      providerMetadata: toolDefinitionProviderMetadata(
        value,
        functionDefinition,
      ),
    });
    return definition ? claimed(definition) : unmatched;
  }

  const customDefinition = asRecord(value.custom);
  if (customDefinition) {
    const definition = toolDefinition({
      name: customDefinition.name ?? value.name,
      description: customDefinition.description,
      inputSchema: customDefinition.format,
      type: value.type,
      providerMetadata: toolDefinitionProviderMetadata(value, customDefinition),
    });
    return definition ? claimed(definition) : unmatched;
  }

  if (value.format !== undefined) {
    const definition = toolDefinition({
      name: value.name,
      description: value.description,
      inputSchema: value.format,
      type: value.type,
      providerMetadata: toolDefinitionProviderMetadata(value, value),
    });
    return definition ? claimed(definition) : unmatched;
  }

  return unmatched;
};

/**
 * Deprecated function-calling protocol: `{role: "function", name, content}`
 * is a tool result carrying the function name instead of a tool_call_id.
 * Claimed as a whole message so `name` becomes the tool name rather than a
 * participant name.
 */
const tryUnwrapLegacyFunctionMessage = (
  value: Record<string, unknown>,
  _fallbackRole: "user" | "assistant",
  ctx: MessageEnvelopeContext,
): ConventionResult<NormalizedMessage> => {
  if (
    // LangChain dict serializations carry `type: "tool"` instead of a role
    // key; the same tool-result shape (tool_call_id, artifact, status).
    (value.role === "tool" || value.type === "tool") &&
    (typeof value.tool_call_id === "string" ||
      typeof value.tool_call_id === "number")
  ) {
    return claimed({
      ...(optionalString(value.id) ? { id: String(value.id) } : {}),
      role: "tool",
      parts: [
        compact({
          type: "tool-result",
          toolCallId: nullableString(value.tool_call_id),
          // A `name` on a tool message is the tool's name, never a
          // participant name.
          toolName: optionalString(value.name),
          output: toJsonValue(parseIfString(value.content ?? null)),
          isError: value.status === "error" ? true : undefined,
          providerMetadata:
            value.artifact !== undefined && value.artifact !== null
              ? toProviderMetadata({ artifact: value.artifact })
              : undefined,
        }),
      ],
      source: ctx.source,
    });
  }

  if (
    typeof value.role !== "string" ||
    value.role.toLowerCase() !== "function"
  ) {
    return unmatched;
  }

  return claimed({
    ...(optionalString(value.id) ? { id: String(value.id) } : {}),
    role: "tool",
    parts: [
      toolResultPart({
        toolCallId: value.tool_call_id,
        toolName: value.name,
        output: value.content,
      }),
    ],
    source: ctx.source,
  });
};

export const openAiProvider: IOConvention = {
  name: "openai",
  finishReasonTypeByRaw: OPENAI_FINISH_REASON_TYPE_BY_RAW,
  tryUnwrapMessage: tryUnwrapLegacyFunctionMessage,
  tryNormalizeToolDefinition: tryNormalizeOpenAiToolDefinition,
  // Deprecated function-calling protocol: function messages are tool results.
  // `developer` is OpenAI's replacement name for `system` (o1+); the API
  // treats them as aliases, so the canonical vocabulary keeps only `system`.
  roleByRawRole: { function: "tool", developer: "system" },
  // Responses reasoning items carry no role but are model output even when
  // replayed on the input side.
  roleByMessageType: { reasoning: "assistant" },
  messageLikeKeys: OPENAI_MESSAGE_LIKE_KEYS,
  citationKeys: OPENAI_CITATION_KEYS,
  typedParts: OPENAI_PART_HANDLERS,
  collectSiblingParts: openAiCollectSiblingParts,
  claimMessages: openAiMessages,
};
