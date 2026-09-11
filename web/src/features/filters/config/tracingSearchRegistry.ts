import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import {
  fieldRegistryFromColumns,
  type FieldOverlay,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";

function tracingFieldRegistry(
  config: FilterConfig,
  id: "traces" | "observations",
): FieldRegistry {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  const fields: Record<string, FieldOverlay> = {
    environment: { aliases: ["env"] },
    userId: { aliases: ["user", "user_id"] },
    sessionId: { aliases: ["session", "session_id"] },
    traceName: {
      aliases: id === "traces" ? ["name", "trace_name"] : ["trace_name"],
    },
    traceTags: { aliases: ["tags", "tag", "trace_tags"] },
    tags: { aliases: ["tag", "traceTags", "trace_tags"] },
    timeToFirstToken: { aliases: ["ttft"] },
    totalTokens: { aliases: ["tokens", "total_tokens"] },
    totalCost: { aliases: ["cost", "total_cost"] },
  };
  for (const facet of config.facets) {
    fields[facet.column] = {
      ...fields[facet.column],
      label: facet.label,
      ...(facet.type === "numeric" ? { unit: facet.unit } : {}),
    };
  }

  return fieldRegistryFromColumns(
    config.columnDefinitions.filter((column) => exposed.has(column.id)),
    {
      id,
      fields,
      metadata: exposed.has("metadata"),
      scores: exposed.has("scores_avg"),
      traceScores: false,
      allowFreeText: true,
      freeTextScopeLabel: "the selected search scope",
      recentSearches: true,
      searchExamples:
        id === "traces"
          ? ["name:checkout", "tags:production", "latency:>2"]
          : ["name:assistant", "type:GENERATION", "scores.quality:>0.8"],
    },
  );
}

export function tracesFieldRegistry(config: FilterConfig): FieldRegistry {
  return tracingFieldRegistry(config, "traces");
}

export function observationsFieldRegistry(config: FilterConfig): FieldRegistry {
  return tracingFieldRegistry(config, "observations");
}
