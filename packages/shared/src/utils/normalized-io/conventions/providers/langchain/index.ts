import { claimed, unmatched } from "../..";
import {
  asRecord,
  compact,
  optionalString,
  parseArray,
} from "../../../core/utils/json";
import { toolCallPart } from "../../../core/normalize/message-parts/tool-calls";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
  ToolCallPart,
} from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  PartHandlerContext,
} from "../../io-convention";

/**
 * LangChain / LangGraph convention: this module owns the `lc`/`kwargs`
 * serialization envelope and the `tool_calls`/`invalid_tool_calls`/
 * `additional_kwargs` sibling fields. LangChain has no finish-reason
 * vocabulary of its own — it surfaces the underlying provider's value under
 * `response_metadata` (picked up generically in `normalize/message.ts`).
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
    // LangChain invalid_tool_calls entries: { name, args, id, error }.
    const record = asRecord(invalidCall);
    const part = record
      ? toolCallPart({
          toolCallId: record.id,
          toolName: record.name,
          input: record.args,
        })
      : null;
    if (!part) continue;
    const error = optionalString(record?.error);
    parts.push(
      compact<ToolCallPart>({
        ...part,
        invalid: true,
        providerMetadata: error ? { error } : undefined,
      }),
    );
  }

  return parts.length > 0
    ? [{ sourceKey: "langchain.siblings", slot: "after-tool-calls", parts }]
    : [];
}

export const langchainProvider = {
  name: "langchain",
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
  tryUnwrapMessage: unwrapLangchainEnvelope,
  collectSiblingParts: langchainCollectSiblingParts,
} satisfies IOConvention;
