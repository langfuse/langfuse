import { claimed, unmatched } from "../..";
import {
  asRecord,
  parseArray,
  parseRecord,
  recordKeyAsParsed,
} from "../../../core/utils/json";
import {
  toolDefinition,
  toolDefinitionProviderMetadata,
} from "../../../core/normalize/tool-definitions";
import type {
  IOConvention,
  PartHandlerContext,
  MessageSource,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

type PydanticMessage = {
  kind: "request" | "response";
  parts: unknown[];
};

function isPydanticMessage(value: unknown): value is PydanticMessage {
  const message = asRecord(value);
  return (
    (message?.kind === "request" || message?.kind === "response") &&
    Array.isArray(message.parts)
  );
}

/** Extract native history without claiming unrelated application state. */
function pydanticAiMessages(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource[] {
  const history = parseArray(parseRecord(root._state)?.message_history);
  if (!history?.length || !history.every(isPydanticMessage)) return [];

  recordKeyAsParsed(root, "_state", "message_history");
  return [
    {
      kind: "sequence",
      values: history.flatMap(pydanticAiMessage),
      fallbackRole: kind === "input" ? "user" : "assistant",
    },
  ];
}

// tryUnwrapMessage returns one message; split mixed-role Pydantic request parts in the claim instead.
function pydanticAiMessage(message: PydanticMessage) {
  if (message.kind === "response") {
    return [{ role: "assistant", parts: message.parts }];
  }
  return message.parts.map((part) => {
    const kind = asRecord(part)?.part_kind;
    let role = "user";
    if (kind === "system-prompt") role = "system";
    if (kind === "tool-return") role = "tool";
    // Prompt content may itself contain several multimodal parts.
    if (kind === "system-prompt" || kind === "user-prompt") {
      return { role, content: asRecord(part)?.content };
    }
    return { role, parts: [part] };
  });
}

function pydanticAiPart(
  part: Record<string, unknown>,
  context: PartHandlerContext,
) {
  const { part_kind, tool_name, tool_call_id, args, ...rest } = part;
  let value: Record<string, unknown>;
  switch (part_kind) {
    case "text":
      value = { ...rest, type: "text" };
      break;
    case "tool-call":
      value = {
        ...rest,
        type: "tool-call",
        toolName: tool_name,
        toolCallId: tool_call_id,
        input: args,
      };
      break;
    case "tool-return":
      value = {
        ...rest,
        type: "tool-result",
        toolName: tool_name,
        toolCallId: tool_call_id,
        output: part.content,
      };
      break;
    default:
      return unmatched;
  }
  return claimed(context.normalizePartValue(value)[0] ?? null);
}

/** Builtin tools use `kind` where the common tool parser expects `type`. */
function pydanticAiBuiltinTool(value: unknown): unknown {
  const tool = asRecord(value);
  if (!tool || typeof tool.kind !== "string") return value;
  const { kind, ...rest } = tool;
  return { ...rest, type: kind };
}

function pydanticAiToolDefinitionSources(
  carrier: ToolDefinitionCarrier,
): ToolDefinitionSource[] {
  const state = parseRecord(carrier.root?._state);
  const sources: ToolDefinitionSource[] = [];
  for (const [sourceKey, value] of [
    [
      "model_request_parameters",
      carrier.metadataAttributes?.model_request_parameters,
    ],
    [
      "_state.last_model_request_parameters",
      state?.last_model_request_parameters,
    ],
  ] as const) {
    const parameters = parseRecord(value);
    for (const key of ["function_tools", "output_tools", "builtin_tools"]) {
      if (parameters?.[key] === undefined) continue;
      sources.push({
        sourceKey: `${sourceKey}.${key}`,
        value:
          key === "builtin_tools"
            ? (parseArray(parameters[key]) ?? []).map(pydanticAiBuiltinTool)
            : parameters[key],
        options: {
          allowProviderToolWithoutName: key === "builtin_tools",
          allowToolMap: key !== "builtin_tools",
        },
      });
    }
  }
  return sources;
}

export const pydanticAiProvider = {
  name: "pydantic-ai",
  claimMessages: pydanticAiMessages,
  tryNormalizeUntypedPart: pydanticAiPart,
  // Pydantic AI tool declarations: { name, description,
  // parameters_json_schema }.
  tryNormalizeToolDefinition: (value: Record<string, unknown>) => {
    if (value.parameters_json_schema === undefined) return unmatched;
    const definition = toolDefinition({
      name: value.name,
      description: value.description,
      inputSchema: value.parameters_json_schema,
      type: value.type,
      providerMetadata: toolDefinitionProviderMetadata(value, value),
    });
    return definition ? claimed(definition) : unmatched;
  },
  collectToolDefinitionSources: pydanticAiToolDefinitionSources,
} satisfies IOConvention;
