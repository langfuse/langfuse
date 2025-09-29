/* eslint-disable no-unused-vars */
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
  ): boolean;
  mapToObservationType(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
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
    ) => boolean,
    private readonly mapFn: (
      attributes: Record<string, unknown>,
      resourceAttributes?: Record<string, unknown>,
      scopeData?: Record<string, unknown>,
    ) => LangfuseObservationType | null,
  ) {}

  canMap(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
  ): boolean {
    return this.canMapFn(attributes, resourceAttributes, scopeData);
  }

  mapToObservationType(
    attributes: Record<string, unknown>,
    resourceAttributes?: Record<string, unknown>,
    scopeData?: Record<string, unknown>,
  ): LangfuseObservationType | null {
    const result = this.mapFn(attributes, resourceAttributes, scopeData);

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
        completion: "GENERATION",
        generate_content: "GENERATION",
        generate: "GENERATION",
        embeddings: "EMBEDDING",
        invoke_agent: "AGENT",
        create_agent: "AGENT",
        execute_tool: "TOOL",
      },
    ),

    new SimpleAttributeMapper("Vercel_AI_SDK_Operation", 4, "operation.name", {
      // Format:
      // Vercel AI SDK Value: Langfuse ObservationType
      "ai.generateText": "GENERATION",
      "ai.generateText.doGenerate": "GENERATION",
      "ai.streamText": "GENERATION",
      "ai.streamText.doStream": "GENERATION",
      "ai.generateObject": "GENERATION",
      "ai.generateObject.doGenerate": "GENERATION",
      "ai.streamObject": "GENERATION",
      "ai.streamObject.doStream": "GENERATION",
      "ai.embed": "EMBEDDING",
      "ai.embed.doEmbed": "EMBEDDING",
      "ai.embedMany": "EMBEDDING",
      "ai.embedMany.doEmbed": "EMBEDDING",
      "ai.toolCall": "TOOL",
    }),

    new CustomAttributeMapper(
      "ModelBased",
      5,
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
  ): LangfuseObservationType | null {
    const sortedMappers = this.getSortedMappers();
    for (const mapper of sortedMappers) {
      if (mapper.canMap(attributes, resourceAttributes, scopeData)) {
        const result = mapper.mapToObservationType(
          attributes,
          resourceAttributes,
          scopeData,
        );
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  getMappersForDebugging(): ReadonlyArray<ObservationTypeMapper> {
    return [...this.mappers];
  }
}
