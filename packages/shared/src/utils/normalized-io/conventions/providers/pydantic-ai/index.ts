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
  MessageSource,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/** Pydantic's agent state carries native request/response history. A request
 * can combine system prompts, user prompts, and tool returns. */
function pydanticAiMessages(
  root: Record<string, unknown>,
  kind: "input" | "output",
): MessageSource[] {
  const state = parseRecord(root._state);
  const history = parseArray(state?.message_history);
  if (
    !history?.length ||
    !history.every((item) => {
      const message = asRecord(item);
      return (
        (message?.kind === "request" || message?.kind === "response") &&
        Array.isArray(message.parts)
      );
    })
  )
    return [];

  const values = history.flatMap((item) => {
    const message = item as Record<string, unknown>;
    const parts = message.parts as unknown[];
    if (message.kind === "response") {
      return [{ role: "assistant", parts: parts.map(pydanticAiPart) }];
    }
    return parts.map((part) => {
      const record = asRecord(part);
      const role =
        record?.part_kind === "system-prompt"
          ? "system"
          : record?.part_kind === "tool-return"
            ? "tool"
            : "user";
      return { role, parts: [pydanticAiPart(part)] };
    });
  });
  recordKeyAsParsed(root, "_state", "message_history");
  return [
    {
      kind: "sequence",
      values,
      fallbackRole: kind === "input" ? "user" : "assistant",
    },
  ];
}

function pydanticAiPart(value: unknown): unknown {
  const part = asRecord(value);
  if (!part) return value;
  const { part_kind, tool_name, tool_call_id, args, ...rest } = part;
  switch (part_kind) {
    case "system-prompt":
    case "user-prompt":
      return part.content;
    case "text":
      return { ...rest, type: "text" };
    case "tool-call":
      return {
        ...rest,
        type: "tool-call",
        toolName: tool_name,
        toolCallId: tool_call_id,
        input: args,
      };
    case "tool-return":
      return {
        ...rest,
        type: "tool-result",
        toolName: tool_name,
        toolCallId: tool_call_id,
        output: part.content,
      };
    default:
      return value;
  }
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
            ? (parseArray(parameters[key]) ?? []).map((tool) => {
                const record = asRecord(tool);
                if (!record || typeof record.kind !== "string") return tool;
                const { kind, ...rest } = record;
                return { ...rest, type: kind };
              })
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
