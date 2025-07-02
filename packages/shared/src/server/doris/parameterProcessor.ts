import { convertDateToAnalyticsDateTime } from "../repositories/analytics";

/**
 * Unified parameter processor for Doris SQL queries
 * Handles all parameter formatting based on ClickHouse type annotations
 */
export class DorisParameterProcessor {
  /**
   * Process query with parameters
   * @param query SQL query with ClickHouse-style parameters: {paramName: Type}
   * @param params Parameter values
   * @returns Processed SQL query
   */
  static processQuery(query: string, params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) {
      return query;
    }

    // Handle typed parameters: {paramName: Type}
    const typedParamPattern = /\{(\w+):\s*([^}]+)\}/g;
    let processedQuery = query.replace(typedParamPattern, (match, paramName, typeInfo) => {
      const paramValue = params[paramName];
      if (paramValue === undefined) {
        return match; // Keep original if parameter not found
      }
      return DorisParameterProcessor.formatValue(paramValue, typeInfo.trim());
    });

    // Handle simple parameters: {paramName}
    const simpleParamPattern = /\{(\w+)\}/g;
    processedQuery = processedQuery.replace(simpleParamPattern, (match, paramName) => {
      const paramValue = params[paramName];
      if (paramValue === undefined) {
        return match;
      }
      return DorisParameterProcessor.escapeBasicValue(paramValue);
    });

    return processedQuery;
  }

  /**
   * Format parameter value based on ClickHouse type annotation
   * @param value The parameter value
   * @param typeInfo ClickHouse type like "Array(String)", "String", "DateTime64(3)", etc.
   * @returns Formatted SQL value
   */
  static formatValue(value: unknown, typeInfo: string): string {
    const normalizedType = typeInfo.toLowerCase();

    // Handle null/undefined
    if (value === null || value === undefined) {
      return 'NULL';
    }

    // Handle Array types: Array(String), Array(Int64), etc.
    if (normalizedType.startsWith('array(')) {
      return DorisParameterProcessor.formatArrayValue(value, typeInfo);
    }

    // Handle DateTime types: DateTime64(3), DateTime, etc.
    if (normalizedType.includes('datetime')) {
      return DorisParameterProcessor.formatDateTimeValue(value);
    }

    // Handle numeric types: Int64, Float64, Decimal64(12), etc.
    if (normalizedType.match(/^(int|float|decimal|number)/)) {
      return DorisParameterProcessor.formatNumericValue(value);
    }

    // Handle Boolean type
    if (normalizedType === 'boolean') {
      return DorisParameterProcessor.formatBooleanValue(value);
    }

    // Handle String and other types - default to string escaping
    return DorisParameterProcessor.escapeBasicValue(value);
  }

  /**
   * Format array values with proper element type handling
   */
  private static formatArrayValue(value: unknown, typeInfo: string): string {
    if (!Array.isArray(value)) {
      return DorisParameterProcessor.escapeBasicValue(value);
    }

    if (value.length === 0) {
      return 'NULL';
    }

    // Extract element type: Array(String) -> String
    const elementType = typeInfo.match(/Array\((.+)\)/i)?.[1] || 'String';
    const escapedValues = value.map(v => DorisParameterProcessor.formatValue(v, elementType));

    // Return comma-separated values (works for both IN clauses and array functions)
    return escapedValues.join(', ');
  }

  /**
   * Format DateTime values using proper timezone handling for Doris
   */
  private static formatDateTimeValue(value: unknown): string {
    if (value instanceof Date) {
      return `'${convertDateToAnalyticsDateTime(value)}'`;
    }
    
    if (typeof value === 'number') {
      const date = new Date(value);
      return `'${convertDateToAnalyticsDateTime(date)}'`;
    }
    
    if (typeof value === 'string') {
      // Try to parse as date, fallback to original string
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return `'${convertDateToAnalyticsDateTime(date)}'`;
        }
      } catch {
        // Fallback to original string with quotes
      }
      return `'${value}'`;
    }
    
    return 'NULL';
  }

  /**
   * Format numeric values
   */
  private static formatNumericValue(value: unknown): string {
    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        return 'NULL';
      }
      return value.toString();
    }
    
    if (typeof value === 'string') {
      const numValue = Number(value);
      if (!isNaN(numValue) && isFinite(numValue)) {
        return numValue.toString();
      }
    }
    
    return 'NULL';
  }

  /**
   * Format boolean values
   */
  private static formatBooleanValue(value: unknown): string {
    return Boolean(value) ? 'TRUE' : 'FALSE';
  }

  /**
   * Basic value escaping for strings and fallback cases
   */
  private static escapeBasicValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (value instanceof Date) {
      return `'${convertDateToAnalyticsDateTime(value)}'`;
    }

    // For other types, convert to string and escape
    return DorisParameterProcessor.escapeBasicValue(String(value));
  }

  /**
   * Validate and sanitize parameter name to prevent injection
   */
  private static validateParameterName(paramName: string): boolean {
    // Only allow alphanumeric characters and underscores
    return /^[a-zA-Z0-9_]+$/.test(paramName);
  }

  /**
   * Get supported type information for debugging/documentation
   */
  static getSupportedTypes(): string[] {
    return [
      'String',
      'Int32', 'Int64',
      'Float32', 'Float64',
      'Decimal64(n)',
      'Boolean',
      'DateTime', 'DateTime64(3)',
      'Array(String)', 'Array(Int64)', 'Array(Float64)',
      // Add more as needed
    ];
  }
} 