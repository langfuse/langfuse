import {
  formatSessionPositionInTraceFilterValue,
  type FilterCondition,
  type FilterState,
} from "@langfuse/shared";
import { FilterToken } from "./FilterToken";
import { cn } from "@/src/utils/tailwind";
import { type FilterSummaryToken } from "@/src/components/design-system/FilterBuilderDropdown/FilterBuilderDropdown";

function formatValue(filter: FilterCondition) {
  switch (filter.type) {
    case "positionInTrace":
      return formatSessionPositionInTraceFilterValue(filter);
    case "datetime":
      return new Date(filter.value).toLocaleString();
    case "stringOptions":
    case "arrayOptions":
      return filter.value.length > 2
        ? `${filter.value.length} selected`
        : filter.value.join(", ");
    case "number":
    case "numberObject":
      return filter.value;
    case "boolean":
    case "booleanObject":
      return String(filter.value);
    case "null":
      return "";
    default:
      return `"${filter.value}"`;
  }
}

export function getFilterSummaryTokens(
  filterState: FilterState,
): FilterSummaryToken[] {
  return filterState.map((filter) => {
    const column =
      filter.type === "stringObject" ||
      filter.type === "numberObject" ||
      filter.type === "booleanObject"
        ? `${filter.column}.${filter.key}`
        : filter.column;
    const value = String(formatValue(filter));
    const numericValue =
      value !== "" && /^-?\d+(\.\d+)?$/.test(String(value).trim());

    return { column, operator: filter.operator, value, numericValue };
  });
}

export function FilterSummary({
  filterState,
  className,
}: {
  filterState: FilterState;
  className?: string;
}) {
  return getFilterSummaryTokens(filterState).map(
    ({ column, operator, value, numericValue }, index) => (
      <span
        key={index}
        className={cn("ml-2 inline-block text-xs whitespace-nowrap", className)}
      >
        <FilterToken deactivated={false} title={undefined}>
          <span className="text-qlang-field">{column}</span>{" "}
          <span className="text-muted-foreground">{operator}</span>
          {value !== "" && (
            <>
              {" "}
              <span
                className={
                  numericValue ? "text-qlang-number" : "text-qlang-value"
                }
              >
                {value}
              </span>
            </>
          )}
        </FilterToken>
      </span>
    ),
  );
}
