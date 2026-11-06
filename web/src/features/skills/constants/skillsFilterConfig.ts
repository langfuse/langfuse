import { useMemo } from "react";
import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterConfig } from "@/src/features/filters/lib/filter-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

const columns: ColumnDefinition[] = [
  {
    id: "tags",
    name: "Tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
  },
];

export const skillsFilterConfig: FilterConfig = {
  tableName: "skills",
  columnDefinitions: columns,
  defaultExpanded: ["tags"],
  defaultSidebarCollapsed: true,
  facets: [
    {
      type: "categorical",
      column: "tags",
      label: "Tags",
      disableTextFilter: true,
    },
  ],
};

function capitalizeKey(key: string): string {
  if (!key) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Merges dynamic SKILL.md metadata facets (one per key) into the base skills filter config. */
export function withSkillMetadataFacets(
  config: FilterConfig,
  keys: readonly string[],
): FilterConfig {
  if (keys.length === 0) return config;
  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
  const extraColumns: ColumnDefinition[] = sortedKeys.map((key) => ({
    id: `metadata.${key}`,
    name: capitalizeKey(key),
    type: "stringOptions",
    internal: `metadata.${key}`,
    options: [],
  }));
  const extraFacets = sortedKeys.map((key) => ({
    type: "categorical" as const,
    column: `metadata.${key}`,
    label: capitalizeKey(key),
    disableTextFilter: true,
  }));
  return {
    ...config,
    columnDefinitions: [...config.columnDefinitions, ...extraColumns],
    facets: [...config.facets, ...extraFacets],
    defaultExpanded: [
      ...(config.defaultExpanded ?? []),
      ...sortedKeys.map((key) => `metadata.${key}`),
    ],
  };
}

/** Stabilized filter config when metadata facet keys load asynchronously. */
export function useSkillsFilterConfig(metadataKeys: readonly string[]): FilterConfig {
  return useMemo(
    () => withSkillMetadataFacets(skillsFilterConfig, metadataKeys),
    [metadataKeys],
  );
}

export const SKILLS_FIELD_REGISTRY = fieldRegistryFromColumns(columns, {
  id: "skills",
  allowFreeText: true,
  defaultSearchType: ["id"],
  freeTextScopeLabel: "skill names, descriptions, and metadata values",
  recentSearches: true,
  searchExamples: ["tags:support"],
  fields: {
    tags: { aliases: ["tag"] },
  },
});
