import { claimed, unmatched } from "../..";
import { parseRecord } from "../../../core/utils/json";
import {
  toolDefinition,
  toolDefinitionProviderMetadata,
} from "../../../core/normalize/tool-definitions";
import type {
  IOConvention,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/**
 * Pydantic AI convention. Currently tool-definition discovery only: Pydantic
 * AI logs its request config as a `model_request_parameters` span attribute
 * (possibly JSON-encoded) with tool declarations under `function_tools`.
 */
function pydanticAiToolDefinitionSources(
  carrier: ToolDefinitionCarrier,
): ToolDefinitionSource[] {
  const modelRequestParameters = parseRecord(
    carrier.metadataAttributes?.model_request_parameters,
  );
  const functionTools = modelRequestParameters?.function_tools;
  if (functionTools === undefined) return [];

  return [
    {
      sourceKey: "model_request_parameters.function_tools",
      value: functionTools,
      options: { allowToolMap: true },
    },
  ];
}

export const pydanticAiProvider = {
  name: "pydantic-ai",
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
