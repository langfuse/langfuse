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

interface StringFacet {
  type: "string";
  column: string;
  label: string;
}

interface KeyValueFacet {
  type: "keyValue";
  column: string;
  label: string;
  keyOptions?: string[];
}

interface NumericKeyValueFacet {
  type: "numericKeyValue";
  column: string;
  label: string;
  keyOptions?: string[];
}

interface StringKeyValueFacet {
  type: "stringKeyValue";
  column: string;
  label: string;
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
  columnToQueryKey: ColumnToQueryKeyMap;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  defaultSidebarCollapsed?: boolean;
  facets: Facet[];
}
