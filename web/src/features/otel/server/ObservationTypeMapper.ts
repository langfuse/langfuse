import { LangfuseOtelSpanAttributes } from "./attributes";
import type { ObservationType } from "@langfuse/shared";
import { ObservationTypeDomain } from "@langfuse/shared";

type LangfuseObservationType = keyof typeof ObservationType;

/**
 * Configuration for OpenTelemetry attribute mapping to Langfuse observation types.
 *
 * To add new mappings, simply add entries to the MAPPING_CONFIG object below.
 * Each entry specifies what attribute to look for and how to map its values.
 */
const MAPPING_CONFIG = {
  // OpenInference span kinds
  openinference: {
    attributeKey: "openinference.span.kind",
    valueMapping: {
      // SEEN_VALUE: LANGFUSE_OBSERVATION_TYPE
      CHAIN: "CHAIN",
      RETRIEVER: "RETRIEVER",
      LLM: "GENERATION",
      EMBEDDING: "EMBEDDING",
      AGENT: "AGENT",
      TOOL: "TOOL",
      GUARDRAIL: "GUARDRAIL",
      EVALUATOR: "EVALUATOR",
    } as const,
    priority: 1,
  },

  // Model-based generation detection
  modelBased: {
    attributeKeys: [
      LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
      "gen_ai.request.model",
      "gen_ai.response.model",
      "llm.model_name",
      "model",
    ],
    defaultMapping: "GENERATION" as const,
    priority: 2,
  },
} as const;

/**
 * Langfuse Mapping Registry - automatically built from MAPPING_CONFIG above.
 */
export const defaultObservationTypeMapperRegistry =
  new (class ObservationTypeMapperRegistry {
    private readonly mappers = [
      // Simple attribute-value mappers from config
      ...Object.entries(MAPPING_CONFIG)
        .filter(
          (entry): entry is [string, typeof MAPPING_CONFIG.openinference] =>
            "valueMapping" in entry[1],
        )
        .map(([name, config]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          priority: config.priority,
          canMap: (attributes: Record<string, unknown>) =>
            config.attributeKey in attributes &&
            attributes[config.attributeKey] != null,
          mapToObservationType: (
            attributes: Record<string, unknown>,
          ): LangfuseObservationType | null => {
            const value = attributes[config.attributeKey] as string;
            const mappedType =
              config.valueMapping[value as keyof typeof config.valueMapping];

            if (
              mappedType &&
              ObservationTypeDomain.safeParse(mappedType.toUpperCase()).success
            ) {
              return mappedType as LangfuseObservationType;
            }
            return null;
          },
        })),

      // Multi-attribute matchers from config
      ...Object.entries(MAPPING_CONFIG)
        .filter(
          (entry): entry is [string, typeof MAPPING_CONFIG.modelBased] =>
            "attributeKeys" in entry[1],
        )
        .map(([name, config]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          priority: config.priority,
          canMap: (attributes: Record<string, unknown>) =>
            config.attributeKeys.some((key) => attributes[key] != null),
          mapToObservationType: (): LangfuseObservationType | null =>
            config.defaultMapping,
        })),
    ];

    private sortedMappersCache: typeof this.mappers | null = null;

    private getSortedMappers() {
      if (!this.sortedMappersCache) {
        this.sortedMappersCache = [...this.mappers].sort(
          (a, b) => a.priority - b.priority,
        );
      }
      return this.sortedMappersCache;
    }

    mapToObservationType(
      attributes: Record<string, unknown>,
    ): LangfuseObservationType | null {
      const sortedMappers = this.getSortedMappers();

      for (const mapper of sortedMappers) {
        if (mapper.canMap(attributes)) {
          const result = mapper.mapToObservationType(attributes);
          if (result) {
            return result;
          }
        }
      }

      return null;
    }

    getMappers() {
      return [...this.mappers];
    }

    addMapper(mapper: (typeof this.mappers)[0]): void {
      this.mappers.push(mapper);
      this.sortedMappersCache = null;
    }
  })();
