export enum FieldMappingType {
  FREEFORM = "freeform",
  SCHEMA = "schema",
}

export type FreeformField = {
  type: FieldMappingType.FREEFORM;
  columns: CsvColumnPreview[];
};

export type SchemaField = {
  type: FieldMappingType.SCHEMA;
  entries: Array<{ key: string; columns: CsvColumnPreview[] }>;
};

export type FieldMapping = FreeformField | SchemaField;

export type CsvMapping = {
  input: FieldMapping;
  expectedOutput: FieldMapping;
  metadata: CsvColumnPreview[];
};

export type ColumnType =
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

export type ParseOptions = {
  isPreview?: boolean;
  collectSamples?: boolean;
  processor?: RowProcessor;
};
