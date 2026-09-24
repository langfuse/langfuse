import type {
  SourceField,
  MappingMode,
  RootMappingConfig,
  KeyValueMappingEntry as SharedKeyValueMappingEntry,
  MappingTarget,
} from "@langfuse/shared";

export type { SourceField, MappingMode, MappingTarget } from "@langfuse/shared";

export type KeyValueMappingEntry = SharedKeyValueMappingEntry & {
  fromSchema?: boolean;
  isRequired?: boolean;
};

export type CustomMappingConfig = {
  type: MappingTarget;
  rootConfig?: RootMappingConfig;
  keyValueMapConfig?: { entries: KeyValueMappingEntry[] };
};

export type FieldMappingConfig = {
  mode: MappingMode;
  custom?: CustomMappingConfig;
};

export type MappingConfig = {
  input: FieldMappingConfig;
  expectedOutput: FieldMappingConfig;
  metadata: FieldMappingConfig;
};

export type ObservationPreviewData = {
  id: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

export type DatasetInfo = {
  id: string;
  name: string;
  inputSchema: unknown;
  expectedOutputSchema: unknown;
};

export type PreparedMappingField = {
  key: keyof MappingConfig;
  label: string;
  sourceField: SourceField;
  value: unknown;
  schema: unknown;
  errors: string[];
  warnings: string[];
};
