import { type z } from "zod";

import {
  getCompatibleFilterTypes,
  isFilterColumnType,
  type CompatibleFilterType,
  type FilterColumnType,
} from "../../server/queries/clickhouse-sql/filterTypeCompatibility";
import { type ViewDeclarationType, type query } from "./types";

/**
 * invalidViewFilterReason returns why the view cannot run a filter, or
 * undefined when every filter's type fits its column. `numericMetadata`
 * admits `numberObject` metadata filters for views that lower them.
 */
export function invalidViewFilterReason(
  filters: z.infer<typeof query>["filters"],
  view: ViewDeclarationType,
  { numericMetadata = false }: { numericMetadata?: boolean } = {},
): string | undefined {
  for (const filter of filters) {
    const reason = invalidFilterReason(filter, view, numericMetadata);
    if (reason) return reason;
  }
  return undefined;
}

/** resolveFilterDimension resolves a filter column to a view dimension, falling back to `name` for `*Name` columns. */
export function resolveFilterDimension(
  filterColumn: string,
  view: ViewDeclarationType,
): ViewDeclarationType["dimensions"][string] | undefined {
  if (filterColumn in view.dimensions) {
    return view.dimensions[filterColumn];
  }
  if (filterColumn.endsWith("Name") && "name" in view.dimensions) {
    return view.dimensions["name"];
  }
  return undefined;
}

/** invalidFilterReason routes one filter to the check for its column kind. */
function invalidFilterReason(
  filter: ViewFilter,
  view: ViewDeclarationType,
  numericMetadata: boolean,
): string | undefined {
  const dimension = resolveFilterDimension(filter.column, view);
  if (dimension) return invalidDimensionFilterReason(filter, dimension);
  if (filter.column === view.timeDimension) {
    return invalidTimeDimensionFilterReason(filter, view.timeDimension);
  }
  if (filter.column === "metadata") {
    return invalidMetadataFilterReason(filter, numericMetadata);
  }
  return undefined;
}

/** invalidDimensionFilterReason checks a filter against the type of the dimension it resolves to. */
function invalidDimensionFilterReason(
  filter: ViewFilter,
  dimension: ViewDeclarationType["dimensions"][string],
): string | undefined {
  if (dimension.pairExpand) {
    return `Field '${filter.column}' cannot be used as a filter.`;
  }

  const compatibleFilterTypes = getCompatibleFilterTypesForQueryDimension(
    dimension.type,
  );
  if (!compatibleFilterTypes) {
    return `Invalid query dimension '${filter.column}': Unsupported dimension type '${dimension.type ?? "undefined"}'.`;
  }
  if (filter.type === "null") return undefined;

  if (!compatibleFilterTypes.includes(filter.type)) {
    return (
      `Invalid filter for field '${filter.column}': Filter type '${filter.type}' is not supported for dimension type '${dimension.type ?? "string"}'. ` +
      `Expected ${formatExpectedFilterTypes(compatibleFilterTypes)}.`
    );
  }
  if (filter.type === "arrayOptions" && !Array.isArray(filter.value)) {
    return `Invalid filter for field '${filter.column}': arrayOptions type requires an array of values, not '${typeof filter.value}'.`;
  }
  return undefined;
}

/** invalidTimeDimensionFilterReason admits only datetime and null filters on the view's time dimension. */
function invalidTimeDimensionFilterReason(
  filter: ViewFilter,
  timeDimension: string,
): string | undefined {
  const compatibleFilterTypes: CompatibleFilterType[] = ["datetime"];
  if (filter.type === "null") return undefined;
  if (compatibleFilterTypes.includes(filter.type)) return undefined;
  return (
    `Invalid filter for field '${filter.column}': Filter type '${filter.type}' is not supported for time dimension '${timeDimension}'. ` +
    `Expected ${formatExpectedFilterTypes(compatibleFilterTypes)}.`
  );
}

/** invalidMetadataFilterReason checks the filter type only: the `singleFilter` schema already requires `key` and a matching value. */
function invalidMetadataFilterReason(
  filter: ViewFilter,
  numericMetadata: boolean,
): string | undefined {
  const acceptedTypes: CompatibleFilterType[] = ["stringObject"];
  if (numericMetadata) acceptedTypes.push("numberObject");
  if (acceptedTypes.includes(filter.type)) return undefined;
  return (
    `Invalid filter for field 'metadata': Metadata filters require type ${formatExpectedFilterTypes(acceptedTypes)} with a 'key' property, not '${filter.type}'. ` +
    `Example: {"column": "metadata", "type": "stringObject", "key": "environment", "operator": "=", "value": "production"}`
  );
}

/** isQueryArrayDimensionType reports whether a dimension is a ClickHouse Array(String) expression. */
function isQueryArrayDimensionType(dimensionType: string | undefined): boolean {
  return dimensionType === "string[]" || dimensionType === "arrayString";
}

/** getFilterColumnTypeForQueryDimension maps a dimension type to the filter column type it compares as. */
function getFilterColumnTypeForQueryDimension(
  dimensionType: string | undefined,
): FilterColumnType | null {
  if (isQueryArrayDimensionType(dimensionType)) return "arrayOptions";
  if (dimensionType === "null" || dimensionType === "positionInTrace") {
    return null;
  }
  if (isFilterColumnType(dimensionType)) return dimensionType;
  return null;
}

/** getCompatibleFilterTypesForQueryDimension lists the filter types a dimension accepts; array dimensions take only `arrayOptions` so SQL uses hasAny/hasAll. */
function getCompatibleFilterTypesForQueryDimension(
  dimensionType: string | undefined,
): readonly CompatibleFilterType[] | null {
  const filterColumnType = getFilterColumnTypeForQueryDimension(dimensionType);
  if (!filterColumnType) return null;
  if (isQueryArrayDimensionType(dimensionType)) return ["arrayOptions"];
  return getCompatibleFilterTypes(filterColumnType);
}

/** formatExpectedFilterTypes renders filter types as a quoted, human-readable list. */
function formatExpectedFilterTypes(
  filterTypes: readonly CompatibleFilterType[],
): string {
  const quoted = filterTypes.map((filterType) => `'${filterType}'`);
  if (quoted.length === 2) return quoted.join(" or ");
  return quoted.join(", ");
}

/** ViewFilter is one filter of a query. */
type ViewFilter = z.infer<typeof query>["filters"][number];
