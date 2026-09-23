import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterConfig } from "@/src/features/filters/lib/filter-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

const columns: ColumnDefinition[] = [
  {
    id: "labels",
    name: "Labels",
    type: "arrayOptions",
    internal: "labels",
    options: [],
  },
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
  defaultExpanded: ["labels", "tags"],
  defaultSidebarCollapsed: true,
  facets: [
    {
      type: "categorical",
      column: "labels",
      label: "Labels",
      disableTextFilter: true,
    },
    {
      type: "categorical",
      column: "tags",
      label: "Tags",
      disableTextFilter: true,
    },
  ],
};

export const SKILLS_FIELD_REGISTRY = fieldRegistryFromColumns(columns, {
  id: "skills",
  allowFreeText: true,
  defaultSearchType: ["id"],
  freeTextScopeLabel: "skill names and descriptions",
  recentSearches: true,
  searchExamples: ["labels:production", "tags:support"],
  fields: {
    labels: { aliases: ["label"] },
    tags: { aliases: ["tag"] },
  },
});
