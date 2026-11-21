import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterConfig } from "@/src/features/filters/lib/filter-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";
import { FRONTMATTER_FILTER_COLUMN } from "../utils/frontmatterFilterValues";

const columns: ColumnDefinition[] = [
  {
    id: "tags",
    name: "Tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
  },
  {
    id: FRONTMATTER_FILTER_COLUMN,
    name: "Frontmatter",
    type: "stringObject",
    internal: FRONTMATTER_FILTER_COLUMN,
  },
];

export const skillsFilterConfig: FilterConfig = {
  tableName: "skills",
  columnDefinitions: columns,
  defaultExpanded: ["tags", FRONTMATTER_FILTER_COLUMN],
  defaultSidebarCollapsed: true,
  facets: [
    {
      type: "categorical",
      column: "tags",
      label: "Tags",
      disableTextFilter: true,
    },
    {
      type: "stringKeyValue",
      column: FRONTMATTER_FILTER_COLUMN,
      label: "Frontmatter",
      tooltip:
        "Filter by any key in the SKILL.md frontmatter. Nested keys use dots, e.g. metadata.author.",
    },
  ],
};

export const SKILLS_FIELD_REGISTRY = fieldRegistryFromColumns(columns, {
  id: "skills",
  allowFreeText: true,
  defaultSearchType: ["id"],
  freeTextScopeLabel: "skill names and descriptions",
  metadataNamespaces: {
    [FRONTMATTER_FILTER_COLUMN]: FRONTMATTER_FILTER_COLUMN,
  },
  recentSearches: true,
  searchExamples: ["tags:support", "frontmatter.license:MIT"],
  fields: {
    tags: { aliases: ["tag"] },
  },
});
