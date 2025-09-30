import type { ColumnDefinition } from "@langfuse/shared";
import type { ColumnToQueryKeyMap } from "./filter-query-encoding";

interface CategoricalFacet {
  type: "categorical";
  column: string;
  label: string;
}

interface BooleanFacet {
  type: "boolean";
  column: string;
  label: string;
  trueLabel?: string;
  falseLabel?: string;
}

interface NumericFacet {
  type: "numeric";
  column: string;
  label: string;
  min: number;
  max: number;
  unit?: string;
}

export type Facet = CategoricalFacet | BooleanFacet | NumericFacet;

export interface FilterConfig {
  tableName: string;
  columnToQueryKey: ColumnToQueryKeyMap;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  facets: Facet[];
}
