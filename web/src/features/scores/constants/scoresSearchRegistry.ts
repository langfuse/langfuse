import { getScoreFilterConfig } from "@/src/features/filters/config/scores-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

const config = getScoreFilterConfig();
const facetColumns = new Set(config.facets.map((facet) => facet.column));

export const SCORES_FIELD_REGISTRY = fieldRegistryFromColumns(
  config.columnDefinitions.filter((column) => facetColumns.has(column.id)),
  {
    id: "scores",
    metadata: true,
    scores: false,
    traceScores: false,
    // Scores has no full-text lane. Bare text becomes a visible name filter.
    allowFreeText: false,
    defaultTextField: "name",
    recentSearches: true,
    aiFilterPrompt: false,
    hasExample: "userId",
    searchExamples: [
      "name:helpfulness",
      'name:("Rouge Score" OR confidence)',
      "source:EVAL",
      "value:<0.5",
    ],
    fields: {
      name: {
        aliases: ["scoreName", "score_name"],
        label: "Score name",
        description: "Search within score names",
        syncMode: "textSearch",
        suggestObservedValues: true,
      },
      environment: { aliases: ["env"] },
      dataType: { aliases: ["type", "data_type"] },
      value: { label: "Numeric value" },
      booleanValue: { aliases: ["boolean_value"] },
      stringValue: {
        aliases: ["category", "string_value"],
        label: "Categorical value",
      },
      traceId: { aliases: ["trace_id"] },
      sessionId: { aliases: ["session_id"] },
      observationId: { aliases: ["observation_id"] },
      traceName: { aliases: ["trace_name"] },
      userId: { aliases: ["user", "user_id"] },
      tags: { aliases: ["tag", "traceTags", "trace_tags"] },
    },
  },
);
