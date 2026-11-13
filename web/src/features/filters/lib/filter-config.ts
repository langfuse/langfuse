import type React from "react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";

interface BaseFacet {
  column: string;
  label: string;
  tooltip?: string;
  help?: {
    description: React.ReactNode;
    href?: string;
  };
  isDisabled?: boolean;
  disabledReason?: string;
}

interface CategoricalFacet extends BaseFacet {
  type: "categorical";
  /** Optional function to render an icon next to filter option labels */
  renderIcon?: (value: string) => React.ReactNode;
  /** Optional content rendered after a filter option label */
  renderOptionSuffix?: (value: string) => React.ReactNode;
  /** Optional browser hover title for a filter option. */
  getOptionTitle?: (value: string, displayLabel: string) => string;
  /** When true, the sidebar hides the contains/does-not-contain text filter mode for this facet. */
  disableTextFilter?: boolean;
}

interface BooleanFacet extends BaseFacet {
  type: "boolean";
  trueLabel?: string;
  falseLabel?: string;
  invertValue?: boolean; // When true, "True" maps to filter value=false.
}

interface NumericFacet extends BaseFacet {
  type: "numeric";
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

interface StringFacet extends BaseFacet {
  type: "string";
}

interface KeyValueFacet extends BaseFacet {
  type: "keyValue";
  keyOptions?: string[];
}

interface NumericKeyValueFacet extends BaseFacet {
  type: "numericKeyValue";
  keyOptions?: string[];
}

interface BooleanKeyValueFacet extends BaseFacet {
  type: "booleanKeyValue";
  keyOptions?: string[];
}

interface StringKeyValueFacet extends BaseFacet {
  type: "stringKeyValue";
  keyOptions?: string[];
  /**
   * Also offers numeric comparisons (`numberObject` filters on the column).
   * Only for views whose server compiles filters through the events predicate
   * source; legacy filter paths reject `numberObject` on metadata.
   */
  numericValues?: boolean;
}

export type Facet =
  | CategoricalFacet
  | BooleanFacet
  | NumericFacet
  | StringFacet
  | KeyValueFacet
  | NumericKeyValueFacet
  | BooleanKeyValueFacet
  | StringKeyValueFacet;

export type FilterStateMigration = (filters: FilterState) => FilterState;

/**
 * Drops numeric metadata comparisons (`numberObject` on `metadata`), for views
 * whose server rejects them. The events table writes them into the same URL
 * `filter` param, so a shared link would otherwise fail the whole table.
 */
export const dropNumericMetadataFilters: FilterStateMigration = (filters) =>
  filters.filter(
    (filter) =>
      !(filter.column === "metadata" && filter.type === "numberObject"),
  );

export interface FilterConfig {
  tableName: string;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  defaultSidebarCollapsed?: boolean;
  facets: Facet[];
  /** Runs after display-name normalization and before filter validation. */
  migrateFilterState?: FilterStateMigration;
  /**
   * Columns this surface offers no facet for because the page already bounds
   * them (a user-detail traces table). Filters on them are never applied: a
   * constraint the sidebar cannot show must not silently narrow the rows
   * (LFE-14824). Set by `omitFilterFacets`.
   */
  omittedFilterColumns?: string[];
}

export function omitFilterFacets(
  config: FilterConfig,
  omittedColumns: string[],
): FilterConfig {
  if (omittedColumns.length === 0) {
    return config;
  }

  const omittedColumnSet = new Set(omittedColumns);

  return {
    ...config,
    defaultExpanded: config.defaultExpanded?.filter(
      (column) => !omittedColumnSet.has(column),
    ),
    facets: config.facets.filter(
      (facet) => !omittedColumnSet.has(facet.column),
    ),
    omittedFilterColumns: Array.from(
      new Set([...(config.omittedFilterColumns ?? []), ...omittedColumns]),
    ),
  };
}
