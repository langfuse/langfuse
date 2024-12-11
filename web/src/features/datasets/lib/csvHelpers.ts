import { parse } from "csv-parse";
import { Readable } from "stream";
import { type Prisma } from "@langfuse/shared";
import { type StoredFile } from "@/src/features/datasets/server/tempStorage";

export const MAX_PREVIEW_ROWS = 10;

type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "json"
  | "array"
  | "unknown"
  | "mixed";

export type CsvColumnPreview = {
  name: string;
  samples: string[];
  inferredType: ColumnType;
};

export type CsvPreviewResult = {
  fileName: string;
  columns: CsvColumnPreview[];
  totalColumns: number;
  previewRows: number;
  fileId?: string;
};

type ParseCsvOptions = {
  preview?: number;
  onHeader?: (headers: string[]) => void | Promise<void>;
  onRow?: (
    row: string[],
    headers: string[],
    rowIndex: number,
  ) => void | Promise<void>;
  collectSamples?: boolean;
};

const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r", "\n"];

function sanitizeCsvValue(value: string): string {
  // Convert to string and trim
  const str = String(value).trim();

  // Check for formula triggers at start
  if (FORMULA_TRIGGERS.some((trigger) => str.startsWith(trigger))) {
    // Prefix with single quote to prevent formula execution
    return `'${str}`;
  }

  // Remove any control characters
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
}

export async function parseCsv(
  file: StoredFile,
  options: ParseCsvOptions = {},
) {
  return new Promise<CsvPreviewResult>((resolve, reject) => {
    const columnSamples = new Map<string, string[]>();
    let headerRow: string[] = [];
    let rowCount = 0;

    const parser = parse({
      skip_empty_lines: true,
      trim: true,
      bom: true,
      to: options.preview,
      // Add quote and escape characters to prevent injection
      quote: '"',
      escape: '"',
    });

    parser.on("data", async (row: string[]) => {
      try {
        const currentRowIndex = rowCount++;
        if (currentRowIndex === 0) {
          // Header row
          headerRow = row.map((header) => sanitizeCsvValue(header));
          if (options.collectSamples) {
            headerRow.forEach((header) => columnSamples.set(header, []));
          }
          if (options.onHeader) {
            await options.onHeader(headerRow);
          }
        } else {
          // Data rows
          const sanitizedRow = row.map((value) => sanitizeCsvValue(value));

          if (options.collectSamples) {
            sanitizedRow.forEach((value, colIndex) => {
              const header = headerRow[colIndex];
              const samples = columnSamples.get(header) ?? [];
              samples.push(value);
              columnSamples.set(header, samples);
            });
          }
          if (options.onRow) {
            await options.onRow(sanitizedRow, headerRow, currentRowIndex);
          }
        }
      } catch (error) {
        reject(error);
      }
    });

    parser.on("end", () => {
      if (rowCount === 0) {
        reject(new Error("CSV file is empty"));
        return;
      }

      const result: CsvPreviewResult = {
        fileName: file.filename,
        columns: headerRow.map((header) => ({
          name: header,
          samples: options.collectSamples
            ? (columnSamples.get(header) ?? [])
            : [],
          inferredType: options.collectSamples
            ? inferColumnType(columnSamples.get(header) ?? [])
            : "string",
        })),
        totalColumns: headerRow.length,
        previewRows: Math.max(0, rowCount - 1), // Subtract header row
      };

      resolve(result);
    });

    parser.on("error", (error: Error) => {
      reject(new Error(`Failed to parse CSV: ${error.message}`));
    });

    const stream = Readable.from(
      file.content
        .subarray(0, options.preview ? 64 * 1024 : undefined)
        .toString(),
    );
    stream.pipe(parser);
  });
}

function inferColumnType(samples: string[]): ColumnType {
  if (samples.length === 0) return "unknown";

  // Try to parse all samples as JSON and get their types
  const types = new Set(
    samples.map((value) => {
      if (!value || value.toLowerCase() === "null") return "null";

      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return "array";
        if (typeof parsed === "object") return "json";
        return typeof parsed as ColumnType;
      } catch {
        // If JSON parsing fails, return unknown
        return "unknown";
      }
    }),
  );

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

// Helper to parse a single value
export function parseValue(value: string): Prisma.JsonValue {
  try {
    return JSON.parse(value);
  } catch {
    if (value === "" || value.toLowerCase() === "null") return null;
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }
}

// Helper to parse multiple columns into a record
export function parseColumns(
  columnNames: string[],
  row: string[],
  headerMap: Map<string, number>,
): Prisma.JsonValue {
  if (columnNames.length === 0) return null;
  if (columnNames.length === 1) {
    return parseValue(row[headerMap.get(columnNames[0])!]);
  }
  return Object.fromEntries(
    columnNames.map((col) => [col, parseValue(row[headerMap.get(col)!])]),
  );
}
