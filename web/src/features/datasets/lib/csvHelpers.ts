import { parse } from "csv-parse";
import { type Prisma } from "@langfuse/shared";

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

// Shared types
export type CsvPreviewResult = {
  fileName?: string;
  columns: CsvColumnPreview[];
  previewRows: string[][];
  totalColumns: number;
};

type RowProcessor = {
  onHeader?: (headers: string[]) => void | Promise<void>;
  onRow?: (
    row: string[],
    headers: string[],
    index: number,
  ) => void | Promise<void>;
};

type ParseOptions = {
  previewRows?: number;
  collectSamples?: boolean;
  processor?: RowProcessor;
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

// Shared parser configuration
const getParserConfig = (options: ParseOptions) => ({
  skip_empty_lines: true,
  trim: true,
  bom: true,
  to: (options.previewRows || 10) + 1,
  quote: '"',
  escape: '"',
});

// Shared parsing logic
const createParser = async (
  options: ParseOptions,
  resolve: (result: CsvPreviewResult) => void,
  reject: (error: Error) => void,
  fileName?: string,
) => {
  const columnSamples = new Map<string, string[]>();
  let headerRow: string[] = [];
  const previewRows: string[][] = [];
  let rowCount = 0;

  const parser = parse(getParserConfig(options));

  parser.on("data", async (row: string[]) => {
    const currentRowIndex = rowCount++;
    if (currentRowIndex === 0) {
      // Header row
      headerRow = row.map((value) => value.trim());
      if (options.collectSamples) {
        headerRow.forEach((header) => columnSamples.set(header, []));
      }
      if (options.processor?.onHeader) {
        await options.processor.onHeader(headerRow);
      }
    } else if (!options.previewRows || currentRowIndex <= options.previewRows) {
      // Data rows
      const sanitizedRow = row.map((value) => sanitizeCsvValue(value));
      previewRows.push(sanitizedRow);

      if (options.collectSamples) {
        sanitizedRow.forEach((value, colIndex) => {
          const header = headerRow[colIndex];
          const samples = columnSamples.get(header) ?? [];
          samples.push(value);
          columnSamples.set(header, samples);
        });
      }
      if (options.processor?.onRow) {
        await options.processor.onRow(sanitizedRow, headerRow, currentRowIndex);
      }
    }
  });

  parser.on("end", () => {
    if (rowCount === 0) {
      reject(new Error("CSV file is empty"));
      return;
    }

    resolve({
      fileName,
      columns: headerRow.map((header) => ({
        name: header,
        samples: options.collectSamples
          ? (columnSamples.get(header) ?? [])
          : [],
        inferredType: options.collectSamples
          ? inferColumnType(columnSamples.get(header) ?? [])
          : "string",
      })),
      previewRows,
      totalColumns: headerRow.length,
    });
  });

  parser.on("error", (error: Error) => {
    reject(new Error(`Failed to parse CSV: ${error.message}`));
  });

  return parser;
};

// Browser implementation
export async function parseCsvClient(
  file: File,
  options: Omit<ParseOptions, "processor"> = {
    previewRows: 10,
    collectSamples: true,
  },
): Promise<CsvPreviewResult> {
  return new Promise((resolve, reject) => {
    const chunk = file.slice(0, 64 * 1024);
    const reader = new FileReader();

    reader.onload = async () => {
      const parser = await createParser(options, resolve, reject, file.name);
      parser.write(reader.result as string);
      parser.end();
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(chunk);
  });
}

// Node implementation
export async function parseCsvServer(
  buffer: Buffer,
  options: Omit<ParseOptions, "previewRows">,
): Promise<CsvPreviewResult> {
  return new Promise(async (resolve, reject) => {
    const parser = await createParser(options, resolve, reject);

    // Full processing mode: process entire buffer
    parser.write(buffer);
    parser.end();
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
