import type React from "react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";

interface BaseFacet {
  column: string;
  label: string;
  tooltip?: string;
  tooltipHref?: string;
  isDisabled?: boolean;
  disabledReason?: string;
}

interface CategoricalFacet extends BaseFacet {
  type: "categorical";
  /** Optional function to render an icon next to filter option labels */
  renderIcon?: (value: string) => React.ReactNode;
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

interface StringKeyValueFacet extends BaseFacet {
  type: "stringKeyValue";
  keyOptions?: string[];
}

export type Facet =
  | CategoricalFacet
  | BooleanFacet
  | NumericFacet
  | StringFacet
  | KeyValueFacet
  | NumericKeyValueFacet
  | StringKeyValueFacet;

export type FilterStateMigration = (filters: FilterState) => FilterState;

export interface FilterConfig {
  tableName: string;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  defaultSidebarCollapsed?: boolean;
  facets: Facet[];
  /** Runs after display-name normalization and before filter validation. */
  migrateFilterState?: FilterStateMigration;
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
  };
}
