import type React from "react";
import {
  FTS_MATCH_OPERATOR,
  type ColumnDefinition,
  type EventsTableFilterCondition,
  type FilterCondition,
} from "@langfuse/shared";
import type { z } from "zod";

export type SidebarFilterCondition =
  | FilterCondition
  | EventsTableFilterCondition;
export type SidebarFilterState<
  TFilter extends SidebarFilterCondition = FilterCondition,
> = TFilter[];
export type SidebarSingleFilterSchema<
  TFilter extends SidebarFilterCondition = FilterCondition,
> = z.ZodType<TFilter>;

export type TextFilterPolicy = "shortText" | "fullText";
export type TextObjectFilterPolicy = "shortTextObject" | "fullTextObject";

export type StringFilterOperator =
  | "="
  | "contains"
  | "does not contain"
  | "starts with"
  | "ends with";

export type StringKeyValueOperator =
  | "="
  | "contains"
  | "does not contain"
  | "starts with"
  | "ends with"
  | typeof FTS_MATCH_OPERATOR;

export const DEFAULT_STRING_OPERATOR = "contains" as const;

export const DEFAULT_STRING_KEY_VALUE_OPERATORS = [
  "=",
  "contains",
  "does not contain",
] as const satisfies readonly StringKeyValueOperator[];

export const FULL_TEXT_STRING_KEY_VALUE_OPERATORS = [
  FTS_MATCH_OPERATOR,
  "=",
  "contains",
  "does not contain",
] as const satisfies readonly StringKeyValueOperator[];

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
  textFilterPolicy?: TextFilterPolicy;
  defaultOperator?: StringFilterOperator;
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
  textFilterPolicy?: TextObjectFilterPolicy;
  operators?: readonly StringKeyValueOperator[];
  defaultOperator?: StringKeyValueOperator;
}

export type Facet =
  | CategoricalFacet
  | BooleanFacet
  | NumericFacet
  | StringFacet
  | KeyValueFacet
  | NumericKeyValueFacet
  | StringKeyValueFacet;

export type FilterStateMigration<
  TFilter extends SidebarFilterCondition = FilterCondition,
> = (filters: SidebarFilterState<TFilter>) => SidebarFilterState<TFilter>;

export interface FilterConfig<
  TFilter extends SidebarFilterCondition = FilterCondition,
> {
  tableName: string;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  defaultSidebarCollapsed?: boolean;
  facets: Facet[];
  filterSchema?: SidebarSingleFilterSchema<TFilter>;
  /** Runs after display-name normalization and before filter validation. */
  migrateFilterState?: FilterStateMigration<TFilter>;
}

export type SchemaBackedFilterConfig<TFilter extends SidebarFilterCondition> =
  FilterConfig<TFilter> & {
    filterSchema: SidebarSingleFilterSchema<TFilter>;
  };

export const getStringDefaultOperator = (
  facet: Pick<StringFacet, "defaultOperator">,
): StringFilterOperator => facet.defaultOperator ?? DEFAULT_STRING_OPERATOR;

export const getStringKeyValueOperators = (
  facet: Pick<StringKeyValueFacet, "operators" | "textFilterPolicy">,
): readonly StringKeyValueOperator[] =>
  facet.operators ??
  (facet.textFilterPolicy === "fullTextObject"
    ? FULL_TEXT_STRING_KEY_VALUE_OPERATORS
    : DEFAULT_STRING_KEY_VALUE_OPERATORS);

export const getStringKeyValueDefaultOperator = (
  facet: Pick<
    StringKeyValueFacet,
    "defaultOperator" | "operators" | "textFilterPolicy"
  >,
): StringKeyValueOperator =>
  facet.defaultOperator ??
  getStringKeyValueOperators(facet)[0] ??
  DEFAULT_STRING_KEY_VALUE_OPERATORS[0];

export function omitFilterFacets<
  TFilter extends SidebarFilterCondition = FilterCondition,
>(
  config: FilterConfig<TFilter>,
  omittedColumns: string[],
): FilterConfig<TFilter> {
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
