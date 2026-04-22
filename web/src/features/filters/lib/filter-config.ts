import type React from "react";
import type { ColumnDefinition } from "@langfuse/shared";

interface BaseFacet {
  column: string;
  label: string;
  tooltip?: string;
  isDisabled?: boolean;
  disabledReason?: string;
}

interface CategoricalFacet extends BaseFacet {
  type: "categorical";
  /** Optional function to render an icon next to filter option labels */
  renderIcon?: (value: string) => React.ReactNode;
}

interface BooleanFacet extends BaseFacet {
  type: "boolean";
  trueLabel?: string;
  falseLabel?: string;
  invertValue?: boolean; // When true, "True" label maps to filter value=false, used for parent_observation_id filter for is Root?
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

export interface FilterConfig {
  tableName: string;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  defaultSidebarCollapsed?: boolean;
  facets: Facet[];
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
