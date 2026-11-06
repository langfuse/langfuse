import { useMemo } from "react";
import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterConfig } from "@/src/features/filters/lib/filter-config";
import {
  fieldRegistryFromColumns,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";

/** Base columns before SKILL.md metadata facets are merged. */
export const skillsBaseColumnDefinitions: ColumnDefinition[] = [
  {
    id: "tags",
    name: "Tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
  },
];

function capitalizeKey(key: string): string {
  if (!key) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** One `metadata.<key>` facet column per distinct metadata key (sorted). */
export function skillMetadataFacetColumnDefinitions(
  keys: readonly string[],
): ColumnDefinition[] {
  if (keys.length === 0) return [];
  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
  return sortedKeys.map((key) => ({
    id: `metadata.${key}`,
    name: capitalizeKey(key),
    type: "stringOptions",
    internal: `metadata.${key}`,
    options: [],
  }));
}

export const skillsFilterConfig: FilterConfig = {
  tableName: "skills",
  columnDefinitions: skillsBaseColumnDefinitions,
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

/** Merges dynamic SKILL.md metadata facets (one per key) into the base skills filter config. */
export function withSkillMetadataFacets(
  config: FilterConfig,
  keys: readonly string[],
): FilterConfig {
  const extraColumns = skillMetadataFacetColumnDefinitions(keys);
  if (extraColumns.length === 0) return config;

  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
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
export function useSkillsFilterConfig(
  metadataKeys: readonly string[],
): FilterConfig {
  return useMemo(
    () => withSkillMetadataFacets(skillsFilterConfig, metadataKeys),
    [metadataKeys],
  );
}

const SKILLS_SEARCH_REGISTRY_OVERLAY = {
  id: "skills" as const,
  allowFreeText: true,
  defaultSearchType: ["id"] as const,
  freeTextScopeLabel: "skill names, descriptions, and metadata values",
  recentSearches: true,
  searchExamples: ["tags:support"],
  metadataNamespaces: { metadata: "metadata" } as const,
  fields: {
    tags: { aliases: ["tag"] },
  },
} as const;

/**
 * Field registry aligned with the sidebar's facet columns (tags + metadata
 * facets), so the search bar can parse and suggest `metadata.<key>` filters.
 */
export function useSkillsFieldRegistry(
  metadataKeys: readonly string[],
): FieldRegistry {
  return useMemo(() => {
    const config = withSkillMetadataFacets(skillsFilterConfig, metadataKeys);
    const exposed = new Set(config.facets.map((facet) => facet.column));
    const facetColumns = config.columnDefinitions.filter((column) =>
      exposed.has(column.id),
    );
    return fieldRegistryFromColumns(facetColumns, {
      ...SKILLS_SEARCH_REGISTRY_OVERLAY,
      metadata: metadataKeys.length > 0,
    });
  }, [metadataKeys]);
}

export const SKILLS_FIELD_REGISTRY = fieldRegistryFromColumns(
  skillsBaseColumnDefinitions,
  {
    ...SKILLS_SEARCH_REGISTRY_OVERLAY,
    metadata: false,
  },
);
