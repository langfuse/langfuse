import { FilterCondition, FilterState } from "../../types";
import { logger } from "../logger";

export class InMemoryFilterService {
  /**
   * Evaluates whether a data object matches the given filter conditions.
   *
   * @param data - The data object to evaluate
   * @param filter - The filter conditions to apply
   * @param fieldMapper - Function to map filter column names to data object values
   * @returns true if the data matches all filter conditions, false otherwise
   */
  static evaluateFilter<T>(
    data: T,
    filter: FilterState,
    fieldMapper: (data: T, column: string) => unknown, // eslint-disable-line no-unused-vars
  ): boolean {
    logger.debug(
      `Evaluating filter ${JSON.stringify(filter)} for data ${JSON.stringify(data)}`,
    );
    try {
      // If no filters, data matches
      if (!filter || filter.length === 0) {
        return true;
      }

      // Evaluate each filter condition
      for (const condition of filter) {
        if (!this.evaluateFilterCondition(data, condition, fieldMapper)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error("Error evaluating filter in memory", {
        error,
        filterCount: filter?.length || 0,
      });
      // On error, return false to be safe (filter doesn't match)
      return false;
    }
  }

  /**
   * Evaluates a single filter condition against a data object.
   */
  private static evaluateFilterCondition<T>(
    data: T,
    condition: FilterCondition,
    fieldMapper: (data: T, column: string) => unknown, // eslint-disable-line no-unused-vars
  ): boolean {
    const { column, type, operator } = condition;

    // Get the data field value based on the column
    const fieldValue = fieldMapper(data, column);

    switch (type) {
      case "string":
        return this.evaluateStringFilter(fieldValue, condition.value, operator);
      case "datetime":
        return this.evaluateDateTimeFilter(
          fieldValue,
          condition.value,
          operator,
        );
      case "stringOptions":
        return this.evaluateStringOptionsFilter(
          fieldValue,
          condition.value,
          operator,
        );
      case "arrayOptions":
        return this.evaluateArrayOptionsFilter(
          fieldValue,
          condition.value,
          operator,
        );
      case "number":
        return this.evaluateNumberFilter(fieldValue, condition.value, operator);
      case "boolean":
        return this.evaluateBooleanFilter(
          fieldValue,
          condition.value,
          operator,
        );
      case "categoryOptions":
        return this.evaluateCategoryOptionsFilter(
          fieldValue,
          condition.key,
          condition.value,
          operator,
        );
      case "stringObject":
        return this.evaluateStringObjectFilter(
          fieldValue,
          condition.key,
          condition.value,
          operator,
        );
      case "numberObject":
        return this.evaluateNumberObjectFilter(
          fieldValue,
          condition.key,
          condition.value,
          operator,
        );
      case "null":
        return this.evaluateNullFilter(fieldValue, operator);
      default:
        logger.error("Unsupported filter type for in-memory evaluation", {
          type,
          column,
        });
        return false;
    }
  }

  private static evaluateStringFilter(
    fieldValue: unknown,
    filterValue: string,
    operator: string,
  ): boolean {
    const strValue = fieldValue != null ? String(fieldValue) : "";

    switch (operator) {
      case "=":
        return strValue === filterValue;
      case "contains":
        return strValue.includes(filterValue);
      case "does not contain":
        return !strValue.includes(filterValue);
      case "starts with":
        return strValue.startsWith(filterValue);
      case "ends with":
        return strValue.endsWith(filterValue);
      default:
        logger.error("Unsupported string filter operator", {
          operator,
          filterValue,
          fieldValue: strValue,
        });
        return false;
    }
  }

  private static evaluateDateTimeFilter(
    fieldValue: unknown,
    filterValue: Date,
    operator: string,
  ): boolean {
    if (!(fieldValue instanceof Date)) {
      return false;
    }

    const fieldTime = fieldValue.getTime();
    const filterTime = filterValue.getTime();

    switch (operator) {
      case ">":
        return fieldTime > filterTime;
      case "<":
        return fieldTime < filterTime;
      case ">=":
        return fieldTime >= filterTime;
      case "<=":
        return fieldTime <= filterTime;
      default:
        logger.error("Unsupported datetime filter operator", {
          operator,
          filterValue,
          fieldValue,
        });
        return false;
    }
  }

  private static evaluateNumberFilter(
    fieldValue: unknown,
    filterValue: number,
    operator: string,
  ): boolean {
    if (typeof fieldValue !== "number") {
      return false;
    }

    switch (operator) {
      case "=":
        return fieldValue === filterValue;
      case ">":
        return fieldValue > filterValue;
      case "<":
        return fieldValue < filterValue;
      case ">=":
        return fieldValue >= filterValue;
      case "<=":
        return fieldValue <= filterValue;
      default:
        logger.error("Unsupported number filter operator", {
          operator,
          filterValue,
          fieldValue,
        });
        return false;
    }
  }

  private static evaluateCategoryOptionsFilter(
    fieldValue: unknown,
    key: string,
    filterValues: string[],
    operator: string,
  ): boolean {
    if (!fieldValue || typeof fieldValue !== "object") {
      return false;
    }

    // Type assertion is safe here since we've checked typeof fieldValue === "object" above
    const objectValue = (fieldValue as Record<string, unknown>)[key];
    const stringValue = objectValue?.toString() || "";

    switch (operator) {
      case "any of":
        return filterValues.includes(stringValue);
      case "none of":
        return !filterValues.includes(stringValue);
      default:
        logger.error("Unsupported categoryOptions filter operator", {
          operator,
          filterValues,
          fieldValue: stringValue,
          key,
        });
        return false;
    }
  }

  private static evaluateStringOptionsFilter(
    fieldValue: unknown,
    filterValues: string[],
    operator: string,
  ): boolean {
    const strValue = fieldValue ? String(fieldValue) : "";

    switch (operator) {
      case "any of":
        return filterValues.includes(strValue);
      case "none of":
        return !filterValues.includes(strValue);
      default:
        logger.error("Unsupported stringOptions filter operator", {
          operator,
          filterValues,
          fieldValue: strValue,
        });
        return false;
    }
  }

  private static evaluateArrayOptionsFilter(
    fieldValue: unknown,
    filterValues: string[],
    operator: string,
  ): boolean {
    if (!Array.isArray(fieldValue)) {
      return false;
    }

    // Type assertion is safe here since we've checked Array.isArray above
    const arrayValue = fieldValue as unknown[];

    switch (operator) {
      case "any of":
        return arrayValue.some((val) => filterValues.includes(String(val)));
      case "none of":
        return !arrayValue.some((val) => filterValues.includes(String(val)));
      case "all of":
        return filterValues.every((val) =>
          arrayValue.map(String).includes(val),
        );
      default:
        logger.error("Unsupported arrayOptions filter operator", {
          operator,
          filterValues,
          fieldValue,
        });
        return false;
    }
  }

  private static evaluateBooleanFilter(
    fieldValue: unknown,
    filterValue: boolean,
    operator: string,
  ): boolean {
    switch (operator) {
      case "=":
        return fieldValue === filterValue;
      case "<>":
        return fieldValue !== filterValue;
      default:
        logger.error("Unsupported boolean filter operator", {
          operator,
          filterValue,
          fieldValue,
        });
        return false;
    }
  }

  private static evaluateStringObjectFilter(
    fieldValue: unknown,
    key: string,
    filterValue: string,
    operator: string,
  ): boolean {
    if (!fieldValue || typeof fieldValue !== "object") {
      return false;
    }

    // Type assertion is safe here since we've checked typeof fieldValue === "object" above
    const objectValue = (fieldValue as Record<string, unknown>)[key];
    const stringValue = objectValue?.toString() || "";
    return this.evaluateStringFilter(stringValue, filterValue, operator);
  }

  private static evaluateNumberObjectFilter(
    fieldValue: unknown,
    key: string,
    filterValue: number,
    operator: string,
  ): boolean {
    if (!fieldValue || typeof fieldValue !== "object") {
      return false;
    }

    // Type assertion is safe here since we've checked typeof fieldValue === "object" above
    const objectValue = (fieldValue as Record<string, unknown>)[key];
    const numValue =
      typeof objectValue === "number"
        ? objectValue
        : parseFloat(String(objectValue));

    if (isNaN(numValue)) {
      return false;
    }

    switch (operator) {
      case "=":
        return numValue === filterValue;
      case ">":
        return numValue > filterValue;
      case "<":
        return numValue < filterValue;
      case ">=":
        return numValue >= filterValue;
      case "<=":
        return numValue <= filterValue;
      default:
        logger.error("Unsupported numberObject filter operator", {
          operator,
          filterValue,
          fieldValue: numValue,
          key,
        });
        return false;
    }
  }

  private static evaluateNullFilter(
    fieldValue: unknown,
    operator: string,
  ): boolean {
    switch (operator) {
      case "is null":
        return fieldValue === null || fieldValue === undefined;
      case "is not null":
        return fieldValue !== null && fieldValue !== undefined;
      default:
        logger.error("Unsupported null filter operator", {
          operator,
          fieldValue,
        });
        return false;
    }
  }
}
