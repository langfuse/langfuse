import { claimed, unmatched } from "../..";
import {
  asRecord,
  compact,
  optionalString,
  toJsonValue,
} from "../../../core/utils/json";
import {
  filePartFromMediaReference,
  mediaTypeFromDataUri,
  parseMediaReference,
} from "../../../core/normalize/message-parts/media";
import { toolCallPart } from "../../../core/normalize/message-parts/tool-calls";
import { toolResultPart } from "../../../core/normalize/message-parts/tool-results";
import {
  toolDefinition,
  toolDefinitionProviderMetadata,
} from "../../../core/normalize/tool-definitions";
import type { FilePart, FinishReason } from "../../../types";
import type {
  IOConvention,
  PartHandler,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/**
 * Vercel AI SDK convention: this module owns AI SDK's typed part vocabulary
 * and the `ai.prompt.tools` OTel attribute. `aiSdkFilePart` lives in
 * the canonical media builders because the `image`/`file` handlers use the
 * same media-reference mechanics.
 */

// The canonical FinishReason vocabulary is adopted from the AI SDK, so this
// map is the identity.
const AI_SDK_FINISH_REASON_TYPE_BY_RAW: Record<string, FinishReason["type"]> = {
  stop: "stop",
  length: "length",
  "tool-calls": "tool-calls",
  "content-filter": "content-filter",
  error: "error",
  other: "other",
  unknown: "unknown",
};

/**
 * AI SDK file payloads (`data`, legacy `image`, nested reasoning `file`):
 * raw base64 bytes, a URL string, or tagged {type: "data" | "url"} shapes.
 */
function aiSdkFilePart(
  payload: unknown,
  options: {
    mediaType?: string;
    filename?: string;
    fallbackMediaType?: string;
  } = {},
): FilePart | null {
  const tagged = asRecord(payload);
  const candidate = optionalString(tagged?.data ?? tagged?.url ?? payload);
  if (!candidate) return null;

  const reference = parseMediaReference(candidate);
  if (reference) {
    return compact({
      ...filePartFromMediaReference(reference),
      filename: options.filename,
    });
  }

  const isUrl =
    tagged?.type === "url" ||
    (tagged !== undefined && tagged.url !== undefined && !tagged.data) ||
    (!tagged && /^(https?:|data:)/.test(candidate));
  return compact<FilePart>({
    type: "file",
    mediaType:
      options.mediaType ??
      mediaTypeFromDataUri(candidate) ??
      options.fallbackMediaType,
    filename: options.filename,
    content: isUrl
      ? { kind: "url", url: candidate }
      : { kind: "base64", data: candidate },
  });
}

const normalizeAiSdkImage: PartHandler = (value) => {
  // Legacy AI SDK image parts carry the payload directly under `image`/
  // `data`; source-wrapped `image` blocks on the same type name belong to
  // the Anthropic dialect and fall through.
  if (asRecord(value.source)) return unmatched;
  const part = aiSdkFilePart(value.image ?? value.data, {
    mediaType: optionalString(value.mediaType),
    fallbackMediaType: "image/*",
  });
  return part ? claimed(part) : unmatched;
};

const normalizeAiSdkFile: PartHandler = (value) => {
  // AI SDK file parts carry a flat `data`/`url` payload; `file`-wrapped
  // blocks on the same type name belong to the OpenAI chat dialect and fall
  // through.
  if (asRecord(value.file)) return unmatched;
  const part = aiSdkFilePart(value.data ?? value.url, {
    mediaType: optionalString(value.mediaType),
    filename: optionalString(value.filename),
  });
  return part ? claimed(part) : unmatched;
};

const normalizeAiSdkToolError: PartHandler = (value) =>
  claimed({
    // AI SDK tool execution error: the error is the result.
    ...toolResultPart({
      toolCallId: value.toolCallId,
      toolName: value.toolName,
      output: value.error ?? null,
    }),
    isError: true,
  });

const normalizeAiSdkReasoningFile: PartHandler = (value) => {
  // AI SDK reasoning-generated file (a FilePart nested under `file`; older
  // emissions used a flat `data`): it is still a file to every consumer.
  const nested = asRecord(value.file);
  const part = aiSdkFilePart(nested?.data ?? nested?.url ?? value.data, {
    mediaType: optionalString(nested?.mediaType ?? value.mediaType),
    filename: optionalString(nested?.filename ?? value.filename),
  });
  return part ? claimed({ ...part, reasoning: true }) : unmatched;
};

const normalizeAiSdkSource: PartHandler = (value) =>
  claimed({
    // AI SDK source parts are stream-positioned references without a text
    // anchor, so they remain custom parts with their original payload.
    type: "custom",
    kind: "source",
    value: toJsonValue(value),
  });

// AI SDK tool-call parts: { toolCallId, toolName, input } (older emissions
// used `args`).
const normalizeAiSdkToolCall: PartHandler = (value) =>
  claimed(
    toolCallPart({
      toolCallId: value.toolCallId,
      toolName: value.toolName,
      input: value.input ?? value.args,
      toolType: optionalString(value.type),
      providerExecuted: value.providerExecuted,
    }),
  );
// AI SDK tool-result parts: { toolCallId, toolName, output } (v4 emissions
// used `result`).
const normalizeAiSdkToolResult: PartHandler = (value) =>
  claimed(
    toolResultPart({
      toolCallId: value.toolCallId,
      toolName: value.toolName,
      output: value.output ?? value.result,
      isError: typeof value.isError === "boolean" ? value.isError : undefined,
    }),
  );

const AI_SDK_PART_HANDLERS = {
  "tool-call": normalizeAiSdkToolCall,
  "tool-error": normalizeAiSdkToolError,
  "tool-result": normalizeAiSdkToolResult,
  "reasoning-file": normalizeAiSdkReasoningFile,
  source: normalizeAiSdkSource,
  image: normalizeAiSdkImage,
  file: normalizeAiSdkFile,
} satisfies Readonly<Record<string, PartHandler>>;

/**
 * The AI SDK's OTel instrumentation exports the request tools under the
 * `ai.prompt.tools` span attribute (provider built-ins may lack a name).
 */
function aiSdkToolDefinitionSources(
  carrier: ToolDefinitionCarrier,
): ToolDefinitionSource[] {
  const tools = carrier.metadataAttributes?.["ai.prompt.tools"];
  if (tools === undefined) return [];

  return [
    {
      sourceKey: "ai.prompt.tools",
      value: tools,
      options: { allowProviderToolWithoutName: true, allowToolMap: true },
    },
  ];
}

export const aiSdkProvider = {
  name: "ai-sdk",
  finishReasonTypeByRaw: AI_SDK_FINISH_REASON_TYPE_BY_RAW,
  // AI SDK / MCP tool declarations: { name?, description, inputSchema }.
  tryNormalizeToolDefinition: (value: Record<string, unknown>) => {
    if (value.inputSchema === undefined) return unmatched;
    const definition = toolDefinition({
      name: value.name,
      description: value.description,
      inputSchema: value.inputSchema,
      type: value.type,
      providerMetadata: toolDefinitionProviderMetadata(value, value),
    });
    return definition ? claimed(definition) : unmatched;
  },
  // UIMessages carry a `parts` array; camelCase `toolCalls` siblings appear
  // in AI-SDK-flavored (and koog) logging.
  messageLikeKeys: new Set(["parts", "toolCalls"]),
  typedParts: AI_SDK_PART_HANDLERS,
  collectToolDefinitionSources: aiSdkToolDefinitionSources,
} satisfies IOConvention;
