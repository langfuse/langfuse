import { parse } from "csv-parse";
import { type Prisma } from "@langfuse/shared";

const MAX_PREVIEW_ROWS = 10;
const PREVIEW_FILE_SIZE_BYTES = 1024 * 1024 * 2; // 2MB

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
  isPreview?: boolean;
  collectSamples?: boolean;
  processor?: RowProcessor;
};

// Shared parser configuration
const getParserConfig = (options: ParseOptions) => ({
  skip_empty_lines: true,
  trim: true,
  bom: true,
  ...(options.isPreview ? { to: MAX_PREVIEW_ROWS + 1 } : {}),
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
    } else if (
      !options.isPreview ||
      (options.isPreview && currentRowIndex <= MAX_PREVIEW_ROWS)
    ) {
      // Data rows
      const sanitizedRow = row.map((value) => value.trim());
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
  options: ParseOptions,
): Promise<CsvPreviewResult> {
  return new Promise((resolve, reject) => {
    const fileToRead = options.isPreview
      ? file.slice(0, PREVIEW_FILE_SIZE_BYTES)
      : file;

    const reader = new FileReader();

    reader.onload = async () => {
      const parser = await createParser(options, resolve, reject, file.name);
      parser.write(reader.result as string);
      parser.end();
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

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return "array";
    if (typeof parsed === "object") return "json";
    return typeof parsed as ColumnType;
  } catch (error) {
    if (value.toLowerCase() === "true") return "boolean";
    if (value.toLowerCase() === "false") return "boolean";
    if (!isNaN(Number(value))) return "number";
    return "string";
  }
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
  return Object.fromEntries(
    columnNames.map((col) => [col, parseValue(row[headerMap.get(col)!])]),
  );
}
