import { LangfuseOtelSpanAttributes } from "./attributes";
import { type ObservationType, ObservationTypeDomain } from "../../";

type LangfuseObservationType = keyof typeof ObservationType;

interface ObservationTypeMapper {
  readonly name: string;
  readonly priority: number; // Lower numbers = higher priority
  canMap(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
    spanName?: string,
  ): boolean;
  mapToObservationType(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
    spanName?: string,
  ): LangfuseObservationType | null;
}

class SimpleAttributeMapper implements ObservationTypeMapper {
  constructor(
    public readonly name: string,
    public readonly priority: number,
    private readonly attributeKey: string,
    private readonly mappings: Record<string, string>,
  ) {}

  canMap(
    attributes: Record<string, unknown>,
    _resourceAttributes?: Record<string, unknown>,
    _scopeData?: Record<string, unknown>,
    _spanName?: string,
  ): boolean {
    return (
      this.attributeKey in attributes &&
      hasMeaningfulValue(attributes[this.attributeKey])
    );
  }

  mapToObservationType(
    attributes: Record<string, unknown>,
    _resourceAttributes?: Record<string, unknown>,
    _scopeData?: Record<string, unknown>,
    _spanName?: string,
  ): LangfuseObservationType | null {
    const value = attributes[this.attributeKey] as string;
    const mappedType = this.mappings[value];

    if (
      mappedType &&
      ObservationTypeDomain.safeParse(mappedType.toUpperCase()).success
    ) {
      return mappedType as LangfuseObservationType;
    }

    return null;
  }
}

/**
 * Mapper allowing for conditional logic, multiple attribute checks
 */
class CustomAttributeMapper implements ObservationTypeMapper {
  constructor(
    public readonly name: string,
    public readonly priority: number,
    private readonly canMapFn: (
      attributes: Record<string, unknown>,
      resourceAttributes?: Record<string, unknown>,
      scopeData?: Record<string, unknown>,
      spanName?: string,
    ) => boolean,
    private readonly mapFn: (
      attributes: Record<string, unknown>,
      resourceAttributes?: Record<string, unknown>,
      scopeData?: Record<string, unknown>,
      spanName?: string,
    ) => LangfuseObservationType | null,
  ) {}

  canMap(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
    spanName?: string,
  ): boolean {
    return this.canMapFn(attributes, resourceAttributes, scopeData, spanName);
  }

  mapToObservationType(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
    spanName?: string,
  ): LangfuseObservationType | null {
    const result = this.mapFn(
      attributes,
      resourceAttributes,
      scopeData,
      spanName,
    );

    if (
      result &&
      typeof result === "string" &&
      ObservationTypeDomain.safeParse(result.toUpperCase()).success
    ) {
      return result;
    }

    return null;
  }
}

// value is not null, undefined, empty string, or empty object/array
function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object" && value !== null) {
    return Object.keys(value).length > 0;
  }
  return true;
}

// for Vercel AI SDK checks attributes operation.name with startsWith and ai.operationId with equals
function matchesVercelAiSdkOperation(
  attributes: Record<string, unknown>,
  prefixes: string[],
): boolean {
  const operationName = attributes["operation.name"];
  const operationId = attributes["ai.operationId"];

  if (hasMeaningfulValue(operationName)) {
    const opNameStr = operationName as string;
    if (prefixes.some((prefix) => opNameStr.startsWith(prefix))) {
      return true;
    }
  }

  if (hasMeaningfulValue(operationId)) {
    const opIdStr = operationId as string;
    if (prefixes.includes(opIdStr)) {
      return true;
    }
  }

  return false;
}

/**
 * Registry to manage observation type mappers with a unified interface to map
 * span attributes to observation types.
 *
 * Mappers are evaluated in priority order (lower number = higher priority).
 *
 * **NOTE**: This is the constructor to modify if you want to add new mappings.
 */
export class ObservationTypeMapperRegistry {
  private readonly mappers: ObservationTypeMapper[] = [
    // Priority 0: Python SDK <= 3.3.0 override
    // If generation-like attributes are set even though observation type is span, override to 'generation'
    // Issue: https://github.com/langfuse/langfuse/issues/8682
    // Affected SDK versions: Python SDK <= 3.3.0
    new CustomAttributeMapper(
      "PythonSDKv330Override",
      0, // Priority
      // canMap?
      (attributes, resourceAttributes, scopeData) => {
        return (
          attributes[LangfuseOtelSpanAttributes.OBSERVATION_TYPE] === "span" &&
          scopeData?.name === "langfuse-sdk" &&
          resourceAttributes?.["telemetry.sdk.language"] === "python"
        );
      },
      // map!
      (attributes, resourceAttributes, scopeData) => {
        // Check version <= 3.3.0
        const scopeVersion = scopeData?.version as string;
        if (scopeVersion) {
          const [major, minor] = scopeVersion.split(".").map(Number);
          if (major > 3 || (major === 3 && minor > 3)) {
            return null;
          }
        }

        // Check for generation-like attributes
        const generationKeys = [
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
          LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
          LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME,
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
          LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME,
          LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION,
        ];

        const hasGenerationAttributes = Object.keys(attributes).some((key) =>
          generationKeys.includes(key as any),
        );

        if (hasGenerationAttributes) {
          return "GENERATION";
        }

        return null;
      },
    ),

    // Priority 1: maps langfuse.observation.type directly
    new SimpleAttributeMapper(
      "LangfuseObservationTypeDirectMapping",
      1,
      LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
      {
        span: "SPAN",
        generation: "GENERATION",
        event: "EVENT",
        embedding: "EMBEDDING",
        agent: "AGENT",
        tool: "TOOL",
        chain: "CHAIN",
        retriever: "RETRIEVER",
        guardrail: "GUARDRAIL",
        evaluator: "EVALUATOR",
      },
    ),

    new SimpleAttributeMapper("OpenInference", 2, "openinference.span.kind", {
      // Format:
      // OpenInference Value: Langfuse ObservationType
      CHAIN: "CHAIN",
      RETRIEVER: "RETRIEVER",
      LLM: "GENERATION",
      EMBEDDING: "EMBEDDING",
      AGENT: "AGENT",
      TOOL: "TOOL",
      GUARDRAIL: "GUARDRAIL",
      EVALUATOR: "EVALUATOR",
    }),

    new SimpleAttributeMapper(
      "OTel_GenAI_Operation",
      3,
      "gen_ai.operation.name",
      {
        // Format:
        // GenAI Value: Langfuse ObservationType
        chat: "GENERATION",
        // completion was used historically (keeping it for backward compatibility), text_completion is per spec as of 2025-12-04
        completion: "GENERATION",
        text_completion: "GENERATION",
        generate_content: "GENERATION",
        generate: "GENERATION",
        embeddings: "EMBEDDING",
        invoke_agent: "AGENT",
        create_agent: "AGENT",
        execute_tool: "TOOL",
      },
    ),

    // Priority 4: Vercel AI SDK generation/embedding operations (require model information)
    new CustomAttributeMapper(
      // NAME
      "Vercel_AI_SDK_Operation_Generation_Like",
      // PRIORITY
      4,
      // CANMAP?
      (attributes) => {
        const modelKeys = [
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "ai.model.id",
          "gen_ai.request.model",
          "gen_ai.response.model",
        ];
        const hasModelInformation = modelKeys.some((key) =>
          hasMeaningfulValue(attributes[key]),
        );

        // Only handle generation and embedding operations
        const generationEmbeddingPrefixes = [
          "ai.generateText.doGenerate",
          "ai.streamText.doStream",
          "ai.generateObject.doGenerate",
          "ai.streamObject.doStream",
          "ai.embedMany.doEmbed",
          "ai.embed.doEmbed",
        ];

        const isGenerationOrEmbedding = matchesVercelAiSdkOperation(
          attributes,
          generationEmbeddingPrefixes,
        );

        return hasModelInformation && isGenerationOrEmbedding;
      },
      // MAPPER
      (attributes) => {
        // IMPORTANT: prefixes inversely ordered by length to avoid false matches
        // AI SDK may append function ID after operation name (e.g., "ai.embed my-function")
        const prefixMappings: Array<[string[], LangfuseObservationType]> = [
          [
            [
              "ai.generateText.doGenerate",
              "ai.streamText.doStream",
              "ai.generateObject.doGenerate",
              "ai.streamObject.doStream",
            ],
            "GENERATION",
          ],
          [["ai.embedMany.doEmbed", "ai.embed.doEmbed"], "EMBEDDING"],
        ];

        for (const [prefixes, type] of prefixMappings) {
          if (matchesVercelAiSdkOperation(attributes, prefixes)) {
            return type;
          }
        }

        return null;
      },
    ),

    // Priority 5: Vercel AI SDK span-like operations (no model info)
    new CustomAttributeMapper(
      // NAME
      "Vercel_AI_SDK_Operation_Span_Like",
      // PRIORITY
      5,
      // CANMAP?
      (attributes) => {
        // Check if it's a Vercel AI SDK operation (starts with "ai.")
        const operationName = attributes["operation.name"];
        const operationId = attributes["ai.operationId"];

        const hasAiOperation =
          (hasMeaningfulValue(operationName) &&
            (operationName as string).startsWith("ai.")) ||
          (hasMeaningfulValue(operationId) &&
            (operationId as string).startsWith("ai."));

        if (!hasAiOperation) {
          return false;
        }

        // Exclude generation and embedding operations (handled by Generation_Like mapper)
        // technically, not required here because the generation-like mapper has higher priority
        // but to keep them interchangeable, we reject them here
        const generationEmbeddingPrefixes = [
          "ai.generateText.doGenerate",
          "ai.streamText.doStream",
          "ai.generateObject.doGenerate",
          "ai.streamObject.doStream",
          "ai.embedMany.doEmbed",
          "ai.embed.doEmbed",
        ];

        const isGenerationOrEmbedding = matchesVercelAiSdkOperation(
          attributes,
          generationEmbeddingPrefixes,
        );

        return !isGenerationOrEmbedding;
      },
      // MAPPER
      (attributes) => {
        // for now, there are only tools. further mappings should be added here
        if (matchesVercelAiSdkOperation(attributes, ["ai.toolCall"])) {
          return "TOOL";
        }
        return null;
      },
    ),

    // GenAI tool call detection (e.g., Pydantic AI, any framework using gen_ai.tool.* attributes)
    // unfortunately, Pydantic does not set the gen_ai.operation.name attribute on tool calls
    // therefore, we need another mapper here.
    new CustomAttributeMapper(
      "GenAI_Tool_Call",
      6,
      (attributes) => {
        // Check for standard GenAI tool call attributes
        return (
          hasMeaningfulValue(attributes["gen_ai.tool.name"]) ||
          hasMeaningfulValue(attributes["gen_ai.tool.call.id"])
        );
      },
      () => "TOOL",
    ),

    // LiveKit spans: use span name to determine observation type
    new CustomAttributeMapper(
      "LiveKit_SpanName",
      7,
      (_attributes, _resourceAttributes, scopeData, spanName) => {
        if (scopeData?.name !== "livekit-agents") return false;

        return (
          spanName === "agent_turn" ||
          spanName === "start_agent_activity" ||
          spanName === "function_tool"
        );
      },
      (_attributes, _resourceAttributes, _scopeData, spanName) => {
        if (spanName === "agent_turn" || spanName === "start_agent_activity")
          return "AGENT";
        if (spanName === "function_tool") return "TOOL";
        return null;
      },
    ),

    new CustomAttributeMapper(
      "ModelBased",
      8,
      (attributes, _resourceAttributes, _scopeData) => {
        const modelKeys = [
          LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
          "gen_ai.request.model",
          "gen_ai.response.model",
          "llm.model_name",
          "model",
        ];
        return modelKeys.some((key) => hasMeaningfulValue(attributes[key]));
      },
      () => "GENERATION",
    ),
  ];

  private sortedMappersCache: ObservationTypeMapper[] | null = null;

  private getSortedMappers(): ObservationTypeMapper[] {
    if (!this.sortedMappersCache) {
      this.sortedMappersCache = [...this.mappers].sort(
        (a, b) => a.priority - b.priority,
      );
    }
    return this.sortedMappersCache;
  }

  mapToObservationType(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
    spanName?: string,
  ): LangfuseObservationType {
    const sortedMappers = this.getSortedMappers();
    for (const mapper of sortedMappers) {
      if (mapper.canMap(attributes, resourceAttributes, scopeData, spanName)) {
        const result = mapper.mapToObservationType(
          attributes,
          resourceAttributes,
          scopeData,
          spanName,
        );
        if (result) {
          return result;
        }
      }
    }

    return "SPAN";
  }

  getMappersForDebugging(): ReadonlyArray<ObservationTypeMapper> {
    return [...this.mappers];
  }
}
