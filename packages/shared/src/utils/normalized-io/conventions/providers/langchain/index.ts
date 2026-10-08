import { claimed, unmatched } from "../..";
import {
  asRecord,
  compact,
  optionalString,
  parseArray,
} from "../../../core/utils/json";
import { filePartFromUrl } from "../../../core/normalize/message-parts/media";
import {
  providerExecutedToolCall,
  toolCallPart,
} from "../../../core/normalize/message-parts/tool-calls";
import { toolResultPart } from "../../../core/normalize/message-parts/tool-results";
import type {
  FilePart,
  NormalizedMessage,
  NormalizedMessagePart,
  ToolCallPart,
} from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  MessageSource,
  PartHandler,
  PartHandlerContext,
} from "../../io-convention";

/**
 * LangChain / LangGraph convention: this module owns the `lc`/`kwargs`
 * serialization envelope, the `tool_calls`/`invalid_tool_calls`/
 * `additional_kwargs` sibling fields, and the v1 standard content blocks
 * (multimodal, server-side tool and invalid tool call blocks). LangChain has
 * no finish-reason vocabulary of its own — it surfaces the underlying
 * provider's value under `response_metadata` (picked up generically in
 * `normalize/message.ts`).
 */

// FunctionMessage maps to the deprecated "function" role so the legacy
// function-result handling (name as tool name) applies.
const LANGCHAIN_ROLE_BY_CLASS: Record<string, string> = {
  SystemMessage: "system",
  HumanMessage: "user",
  AIMessage: "assistant",
  AIMessageChunk: "assistant",
  ToolMessage: "tool",
  FunctionMessage: "function",
};

/**
 * The LangChain `lc`/`kwargs` serialization envelope: the message fields
 * live in `kwargs`, and the role derives from the class path in `id`.
 */
function unwrapLangchainEnvelope(
  value: Record<string, unknown>,
  fallbackRole: "user" | "assistant",
  ctx: MessageEnvelopeContext,
): ConventionResult<NormalizedMessage> {
  const kwargs = value.lc !== undefined ? asRecord(value.kwargs) : undefined;
  if (!kwargs) return unmatched;

  const classPath = Array.isArray(value.id) ? value.id : [];
  const className = optionalString(classPath[classPath.length - 1]);
  const role = className ? LANGCHAIN_ROLE_BY_CLASS[className] : undefined;
  return claimed(
    ctx.normalizeMessage(
      { ...(role ? { role } : {}), ...kwargs },
      fallbackRole,
    ),
  );
}

function langchainBase64OrFileIdContent(
  value: Record<string, unknown>,
): FilePart["content"] | undefined {
  const base64 = optionalString(value.base64);
  if (base64) return { kind: "base64", data: base64 };
  const fileId = optionalString(value.file_id);
  if (fileId) return { kind: "reference", id: fileId };
  return undefined;
}

/**
 * LangChain v1 standard multimodal blocks: `{ type, url | base64 | file_id,
 * mime_type? }`. The type names are shared with other dialects: Anthropic
 * `source` images and OpenAI `file` wrappers carry none of these source
 * fields, and AI SDK parts declare `mediaType` instead of `mime_type`, so
 * those fall through.
 */
function langchainMediaBlock(fallbackMediaType?: string): PartHandler {
  return (value) => {
    if (value.mediaType !== undefined) return unmatched;

    const mediaType = optionalString(value.mime_type);
    const url = optionalString(value.url);
    if (url) {
      return claimed(filePartFromUrl(url, { mediaType, fallbackMediaType }));
    }

    const content = langchainBase64OrFileIdContent(value);
    if (!content) return unmatched;
    return claimed(
      compact<FilePart>({
        type: "file",
        mediaType: mediaType ?? fallbackMediaType,
        content,
      }),
    );
  };
}

// LangChain v1 server-side tool blocks: the provider ran the tool (web
// search, code execution, remote MCP) and the result names its call by
// `tool_call_id`. The execution `status` stays in providerMetadata.
const normalizeLangchainServerToolCall: PartHandler = (value) =>
  claimed(
    providerExecutedToolCall(
      toolCallPart({
        toolCallId: value.id,
        toolName: value.name,
        input: value.args,
        toolType: "server_tool_call",
      }),
    ),
  );

const normalizeLangchainServerToolResult: PartHandler = (value) =>
  claimed(
    toolResultPart({ toolCallId: value.tool_call_id, output: value.output }),
  );

// LangChain invalid tool calls, `{ name, args, id, error }`, both as
// `invalid_tool_calls` entries and as v1 `invalid_tool_call` content blocks.
function langchainInvalidToolCall(
  record: Record<string, unknown>,
): ToolCallPart | null {
  const part = toolCallPart({
    toolCallId: record.id,
    toolName: record.name,
    input: record.args,
  });
  if (!part) return null;
  const error = optionalString(record.error);
  return compact<ToolCallPart>({
    ...part,
    invalid: true,
    providerMetadata: error ? { error } : undefined,
  });
}

// `text`, `reasoning` and `tool_call` blocks are recognized by the shared and
// OTel GenAI handlers; `text-plain` and `non_standard` stay custom parts.
const LANGCHAIN_PART_HANDLERS = {
  image: langchainMediaBlock("image/*"),
  audio: langchainMediaBlock("audio/*"),
  video: langchainMediaBlock("video/*"),
  file: langchainMediaBlock(),
  server_tool_call: normalizeLangchainServerToolCall,
  server_tool_result: normalizeLangchainServerToolResult,
  // `name` is optional on invalid calls; without one the block stays custom.
  invalid_tool_call: (value) => {
    const part = langchainInvalidToolCall(value);
    return part ? claimed(part) : unmatched;
  },
} satisfies Readonly<Record<string, PartHandler>>;

/**
 * LangChain's `invalid_tool_calls` (attempts the model made whose arguments
 * could not be parsed — kept in the stream as flagged tool calls, raw args
 * as input, so evals can filter them; excluded from the tool columns) and
 * `additional_kwargs.tool_calls` (an echo of the same `tool_calls` shape).
 */
function langchainCollectSiblingParts(
  value: Record<string, unknown>,
  _baseParts: readonly NormalizedMessagePart[],
  context: PartHandlerContext,
): {
  sourceKey: string;
  slot: "after-tool-calls";
  parts: NormalizedMessagePart[];
}[] {
  const parts: NormalizedMessagePart[] = [];

  const additionalKwargs = asRecord(value.additional_kwargs);
  const additionalToolCalls = context.normalizePartList(
    parseArray(additionalKwargs?.tool_calls) ?? [],
  );
  parts.push(...additionalToolCalls);

  for (const invalidCall of parseArray(value.invalid_tool_calls) ?? []) {
    const record = asRecord(invalidCall);
    const part = record ? langchainInvalidToolCall(record) : null;
    if (part) parts.push(part);
  }

  return parts.length > 0
    ? [{ sourceKey: "langchain.siblings", slot: "after-tool-calls", parts }]
    : [];
}

function langchainMessages(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource[] {
  if (kind !== "output" || !Array.isArray(root.generations)) return [];

  // LLMResult batches generations; ChatResult contains a flat list.
  const sources: MessageSource[] = [];
  for (const value of root.generations.flat(1)) {
    const generation = asRecord(value);
    if (!generation) return [];
    const message = asRecord(generation.message);
    if (!message && typeof generation.text !== "string") return [];
    sources.push({
      kind: "single",
      value: message ?? generation.text,
      fallbackRole: "assistant",
      finishReasonCarrier: asRecord(generation.generation_info),
    });
  }
  return sources;
}

export const langchainProvider = {
  name: "langchain",
  claimMessages: langchainMessages,
  // Serialized LangChain message classes carry their role as a type string.
  roleByMessageType: {
    human: "user",
    ai: "assistant",
    tool: "tool",
    system: "system",
  },
  // Parsed calls live in `tool_calls`, raw provider extras in
  // `additional_kwargs`.
  messageLikeKeys: new Set(["tool_calls", "additional_kwargs"]),
  typedParts: LANGCHAIN_PART_HANDLERS,
  tryUnwrapMessage: unwrapLangchainEnvelope,
  collectSiblingParts: langchainCollectSiblingParts,
} satisfies IOConvention;
