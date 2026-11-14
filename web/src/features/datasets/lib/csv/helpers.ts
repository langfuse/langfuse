import { parse } from "csv-parse";
import {
  isJsonNumberLiteral,
  parseJsonPrioritised,
  type Prisma,
} from "@langfuse/shared";
import type {
  ParseOptions,
  CsvPreviewResult,
  ColumnType,
  FieldMapping,
  FreeformField,
  SchemaField,
} from "./types";

const MAX_PREVIEW_ROWS = 10;
const PREVIEW_FILE_SIZE_BYTES = 1024 * 1024 * 2; // 2MB

// Shared parser configuration
const getParserConfig = (options: ParseOptions) => ({
  skip_empty_lines: true,
  trim: true,
  bom: true,
  ...(options.isPreview ? { to: MAX_PREVIEW_ROWS + 1 } : {}),
  quote: '"',
  escape: '"',
});

const processRows = async (
  rows: string[][],
  options: ParseOptions,
  fileName: string,
): Promise<CsvPreviewResult> => {
  const header = rows.shift();
  if (!header) {
    throw new Error("CSV file is empty");
  }

  const headerRow = header.map((value) => value.trim());
  const columnSamples = new Map<string, string[]>();
  await options.processor?.onHeader?.(headerRow);

  // Reuse the parser's rows so large imports retain only one set of row arrays.
  for (const [index, row] of rows.entries()) {
    row.forEach((value, colIndex) => {
      const trimmed = value.trim();
      row[colIndex] = trimmed;
      if (options.collectSamples) {
        const header = headerRow[colIndex];
        const samples = columnSamples.get(header) ?? [];
        samples.push(trimmed);
        columnSamples.set(header, samples);
      }
    });
    if (options.processor?.onRow) {
      await options.processor.onRow(row, headerRow, index + 1);
    }
  }

  return {
    fileName,
    columns: headerRow.map((header) => ({
      name: header,
      samples: options.collectSamples ? (columnSamples.get(header) ?? []) : [],
      inferredType: options.collectSamples
        ? inferColumnType(columnSamples.get(header) ?? [])
        : "string",
    })),
    previewRows: rows,
    totalColumns: headerRow.length,
  };
};

// Browser implementation
export async function parseCsvClient(
  file: File,
  options: ParseOptions,
): Promise<CsvPreviewResult> {
  return new Promise((resolve, reject) => {
    const isTruncatedPreview =
      Boolean(options.isPreview) && file.size > PREVIEW_FILE_SIZE_BYTES;
    const rejectWithTruncationHint = (error: Error) => {
      if (isTruncatedPreview && error.message.includes("Quote Not Closed")) {
        reject(
          new Error(
            "The file's single dataset items are too large. CSV imports are intended for text and structured JSON dataset items. Use the UI item editor or API/SDKs for multi-modal or very large dataset items: https://langfuse.com/docs/evaluation/experiments/datasets#multi-modal-dataset-items",
          ),
        );
        return;
      }
      reject(error);
    };

    const fileToRead = options.isPreview
      ? file.slice(0, PREVIEW_FILE_SIZE_BYTES)
      : file;

    const reader = new FileReader();

    reader.onload = () => {
      parse(reader.result as string, getParserConfig(options), (error, rows) => {
        if (error) {
          rejectWithTruncationHint(
            new Error(`Failed to parse CSV: ${error.message}`),
          );
          return;
        }
        processRows(rows, options, file.name).then(resolve, reject);
      });
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(fileToRead);
  });
}

function inferColumnType(samples: string[]): ColumnType {
  if (samples.length === 0) return "unknown";

  // Try to parse all samples as JSON and get their types
  const types = new Set(samples.map((value) => inferTypeFromValue(value)));

  // If all values are null, return null type
  if (types.size === 1 && types.has("null")) {
    return "null";
  }

  // If we have nulls and one other type, return that type
  if (types.size === 2 && types.has("null")) {
    const nonNullType = Array.from(types).find((t) => t !== "null");
    return nonNullType as ColumnType;
  }

  // If all values are the same type (and not null), return that type
  if (types.size === 1) {
    return Array.from(types)[0] as ColumnType;
  }

  // If we have multiple types, return mixed
  return "mixed";
}

function inferTypeFromValue(value: string): ColumnType {
  if (!value || value.toLowerCase() === "null") return "null";

  const parsed = parseValue(value);
  if (Array.isArray(parsed)) return "array";
  if (typeof parsed === "object" && parsed !== null) return "json";
  return typeof parsed as ColumnType;
}

// Helper to parse a single value
export function parseValue(value: string): Prisma.JsonValue {
  if (value === "" || value.toLowerCase() === "null") return null;

  const parsed = parseJsonPrioritised(value);
  if (
    parsed !== undefined &&
    (parsed !== value || isJsonNumberLiteral(value))
  ) {
    return parsed as Prisma.JsonValue;
  }

  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;

  const numericValue = Number(value);
  if (
    Number.isFinite(numericValue) &&
    Math.abs(numericValue) <= Number.MAX_SAFE_INTEGER
  ) {
    return numericValue;
  }

  return value;
}

// Helper to parse multiple columns into a record
export function parseColumns(
  columnNames: string[],
  row: string[],
  headerMap: Map<string, number>,
  options?: { wrapSingleColumn?: boolean },
): Prisma.JsonValue {
  if (columnNames.length === 0) return null;

  // Single column: wrap if requested, else return raw value
  if (columnNames.length === 1) {
    const col = columnNames[0];
    const rawValue = row[headerMap.get(col)!];
    const parsedValue = parseValue(rawValue);

    if (options?.wrapSingleColumn) {
      return { [col]: parsedValue };
    }
    return parsedValue;
  }

  // Multiple columns: nest columns into json objects
  return Object.fromEntries(
    columnNames.map((col) => [col, parseValue(row[headerMap.get(col)!])]),
  );
}

// Helper to build object from schema key mapping
export function buildSchemaObject(
  mapping: Record<string, string[]>, // {schemaKey: [csvColumn1, csvColumn2, ...]}
  row: string[],
  headerMap: Map<string, number>,
): Prisma.JsonValue {
  const entries = Object.entries(mapping);
  if (entries.length === 0) return null;

  return Object.fromEntries(
    entries.map(([schemaKey, csvColumns]) => {
      if (csvColumns.length === 1) {
        // Single column: use the raw value
        return [schemaKey, parseValue(row[headerMap.get(csvColumns[0]!)!])];
      }
      // Multiple columns: create an object
      return [
        schemaKey,
        Object.fromEntries(
          csvColumns.map((csvColumn) => [
            csvColumn,
            parseValue(row[headerMap.get(csvColumn)!]),
          ]),
        ),
      ];
    }),
  );
}

// Type guard helpers
export function isFreeformField(field: FieldMapping): field is FreeformField {
  return field.type === "freeform";
}

export function isSchemaField(field: FieldMapping): field is SchemaField {
  return field.type === "schema";
}
