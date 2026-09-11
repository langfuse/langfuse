import { promptFilterConfig } from "@/src/features/filters/config/prompts-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

const facetColumns = new Set(
  promptFilterConfig.facets.map((facet) => facet.column),
);

export const PROMPTS_FIELD_REGISTRY = fieldRegistryFromColumns(
  promptFilterConfig.columnDefinitions.filter((column) =>
    facetColumns.has(column.id),
  ),
  {
    id: "prompts",
    allowFreeText: true,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "prompt names and tags",
    searchScopes: {
      content: {
        searchType: ["content"],
        label: "Prompt content",
        description: "search only the prompt content",
      },
      all: {
        searchType: ["id", "content"],
        label: "Names, tags and content",
        description: "search prompt names, tags and content",
      },
    },
    recentSearches: true,
    searchExamples: ["type:chat", "labels:production", "version:>1"],
    fields: {
      labels: { aliases: ["label"] },
      tags: { aliases: ["tag"] },
    },
  },
);
