import type { ColumnDefinition } from "@langfuse/shared";

interface BaseFacet {
  column: string;
  label: string;
  isDisabled?: boolean;
  disabledReason?: string;
  // Mutually exclusive with these facet columns. If both are active,
  // the last added filter wins and the other facet is disabled.
  mutuallyExclusiveWith?: string[];
}

interface CategoricalFacet extends BaseFacet {
  type: "categorical";
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

interface PositionInTraceFacet extends BaseFacet {
  type: "positionInTrace";
}

export type Facet =
  | CategoricalFacet
  | BooleanFacet
  | NumericFacet
  | StringFacet
  | KeyValueFacet
  | NumericKeyValueFacet
  | StringKeyValueFacet
  | PositionInTraceFacet;

export interface FilterConfig {
  tableName: string;
  columnDefinitions: ColumnDefinition[];
  defaultExpanded?: string[];
  defaultSidebarCollapsed?: boolean;
  facets: Facet[];
}
