import { UiColumnMappings, type FilterState } from "@langfuse/shared";
import { logger } from "../../../../packages/shared/dist/src/server/logger";

export function executeMemoryFilters({
  object,
  filters,
  columnMappings,
}: {
  object: Record<string, unknown>;
  filters: FilterState;
  columnMappings: UiColumnMappings;
}): boolean {
  // Return true if there are no filters
  if (filters.length === 0) {
    return true;
  }

  // Check each filter condition
  for (const filter of filters) {
    // Find the column mapping that matches this filter
    logger.info(
      `filter ${JSON.stringify(filter.column)} ${JSON.stringify(
        filter.operator,
      )} ${JSON.stringify(filter.value)}`,
    );
    const mapping = columnMappings.find((m) => m.uiTableId === filter.column);

    if (!mapping) {
      throw new Error(`Column mapping not found for filter: ${filter.column}`);
    }

    if (!mapping.memorySelect) {
      throw new Error(`Column mapping not found for filter: ${filter.column}`);
    }

    // Get the actual value from the object using the path
    const actualValue = getValueByPath(object, mapping.memorySelect);

    // If we can't find the value, skip this filter
    if (actualValue === undefined) {
      logger.info(`Value not found for filter: ${mapping.memorySelect} `);
      continue;
    }

    // Apply the appropriate filter based on type
    const passes = applyFilterCondition(filter, actualValue);

    // If any filter fails, return false
    return passes;
  }

  // If all filters pass, return true
  return true;
}

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  // Since path is only the first level key of a json, we can directly access it
  if (obj === null || obj === undefined) {
    return undefined;
  }

  logger.info(`obj ${JSON.stringify(obj)}`);
  logger.info(`path ${path}`);

  return obj[path];
}

function applyFilterCondition(
  filter: FilterState[number],
  actualValue: unknown,
): boolean {
  switch (filter.type) {
    case "datetime":
      return applyDateTimeFilter(actualValue, filter.value, filter.operator);

    case "arrayOptions":
      return applyArrayOptionsFilter(
        actualValue,
        filter.value,
        filter.operator,
      );

    case "stringOptions":
      return applyStringOptionsFilter(
        actualValue,
        filter.value,
        filter.operator,
      );

    case "categoryOptions":
      return applyCategoryOptionsFilter(
        actualValue,
        filter.value,
        filter.operator,
        filter.key,
      );

    case "string":
      return applyStringFilter(actualValue, filter.value, filter.operator);

    case "number":
      return applyNumberFilter(actualValue, filter.value, filter.operator);

    case "boolean":
      return applyBooleanFilter(actualValue, filter.value, filter.operator);

    case "null":
      return applyNullFilter(actualValue, filter.operator);

    case "stringObject":
      return applyStringFilter(
        getNestedObjectValue(actualValue, filter.key),
        filter.value,
        filter.operator,
      );

    case "numberObject":
      return applyNumberFilter(
        getNestedObjectValue(actualValue, filter.key),
        filter.value,
        filter.operator,
      );

    default:
      // Unknown filter type, return true to not filter
      return true;
  }
}

function getNestedObjectValue(obj: unknown, key: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }

  return (obj as Record<string, unknown>)[key];
}

function applyDateTimeFilter(
  actualValue: unknown,
  filterValue: Date,
  operator: string,
): boolean {
  if (!(actualValue instanceof Date)) {
    // Try to convert to date if it's a string or number
    if (typeof actualValue === "string" || typeof actualValue === "number") {
      actualValue = new Date(actualValue);
    } else {
      return true; // Skip if can't convert to date
    }
  }

  const actualDate = (actualValue as Date).getTime();
  const filterDate = filterValue.getTime();

  switch (operator) {
    case "<":
      return actualDate < filterDate;
    case "<=":
      return actualDate <= filterDate;
    case ">":
      return actualDate > filterDate;
    case ">=":
      return actualDate >= filterDate;
    case "=":
      return actualDate === filterDate;
    default:
      return true;
  }
}

function applyArrayOptionsFilter(
  actualValue: unknown,
  filterValue: string[],
  operator: string,
): boolean {
  // Ensure the actual value is an array
  if (!Array.isArray(actualValue)) {
    return true;
  }

  switch (operator) {
    case "any of":
      return filterValue.some((value) => actualValue.includes(value));
    case "none of":
      return !filterValue.some((value) => actualValue.includes(value));
    case "all of":
      return filterValue.every((value) => actualValue.includes(value));
    default:
      return true;
  }
}

function applyStringOptionsFilter(
  actualValue: unknown,
  filterValue: string[],
  operator: string,
): boolean {
  if (typeof actualValue !== "string") {
    return true;
  }

  switch (operator) {
    case "any of":
      return filterValue.includes(actualValue);
    case "none of":
      return !filterValue.includes(actualValue);
    default:
      return true;
  }
}

function applyCategoryOptionsFilter(
  actualValue: unknown,
  filterValue: string[],
  operator: string,
  key: string,
): boolean {
  if (!Array.isArray(actualValue)) {
    return true;
  }

  // Flatten the hierarchical structure into array of "parent:child" strings
  const flattenedValues: string[] = [];
  filterValue.forEach((child) => {
    flattenedValues.push(`${key}:${child}`);
  });

  switch (operator) {
    case "any of":
      return flattenedValues.some((value) => actualValue.includes(value));
    case "none of":
      return !flattenedValues.some((value) => actualValue.includes(value));
    default:
      return true;
  }
}

function applyStringFilter(
  actualValue: unknown,
  filterValue: string,
  operator: string,
): boolean {
  logger.info(`actualValue ${JSON.stringify(actualValue)}`);
  logger.info(`filterValue ${JSON.stringify(filterValue)}`);
  logger.info(`operator ${JSON.stringify(operator)}`);
  if (typeof actualValue !== "string") {
    return true;
  }

  logger.info(
    `applyStringFilter contains ${JSON.stringify(actualValue.includes(filterValue))}`,
  );

  switch (operator) {
    case "=":
      return actualValue === filterValue;
    case "contains":
      return actualValue.includes(filterValue);
    case "does not contain":
      return !actualValue.includes(filterValue);
    case "starts with":
      return actualValue.startsWith(filterValue);
    case "ends with":
      return actualValue.endsWith(filterValue);
    default:
      return true;
  }
}

function applyNumberFilter(
  actualValue: unknown,
  filterValue: number,
  operator: string,
): boolean {
  const numActual =
    typeof actualValue === "number" ? actualValue : Number(actualValue);
  const numFilter = filterValue;

  if (isNaN(numActual)) {
    return true;
  }

  switch (operator) {
    case "=":
      return numActual === numFilter;
    case "!=":
      return numActual !== numFilter;
    case "<":
      return numActual < numFilter;
    case "<=":
      return numActual <= numFilter;
    case ">":
      return numActual > numFilter;
    case ">=":
      return numActual >= numFilter;
    default:
      return true;
  }
}

function applyBooleanFilter(
  actualValue: unknown,
  filterValue: boolean,
  operator: string,
): boolean {
  const boolActual = Boolean(actualValue);
  const boolFilter = filterValue;

  switch (operator) {
    case "=":
      return boolActual === boolFilter;
    case "<>":
      return boolActual !== boolFilter;
    default:
      return true;
  }
}

function applyNullFilter(actualValue: unknown, operator: string): boolean {
  switch (operator) {
    case "is null":
      return actualValue === null || actualValue === undefined;
    case "is not null":
      return actualValue !== null && actualValue !== undefined;
    default:
      return true;
  }
}
