// Re-export base types from shared
export type {
  SourceField,
  MappingMode,
  MappingTarget,
  RootMappingConfig,
  AddToDatasetMapping,
} from "@langfuse/shared";

import type {
  SourceField,
  MappingMode,
  RootMappingConfig,
  KeyValueMappingEntry as SharedKeyValueMappingEntry,
  MappingTarget,
} from "@langfuse/shared";

// Step definitions - dialog-specific
export type DialogStep =
  | "choice"
  | "select"
  | "create"
  | "input-mapping"
  | "output-mapping"
  | "metadata-mapping"
  | "preview"
  | "status";

// Extended KeyValueMappingEntry with UI-specific properties
export type KeyValueMappingEntry = SharedKeyValueMappingEntry & {
  /** Whether this entry was generated from schema (UI only, not persisted) */
  fromSchema?: boolean;
  /** Whether this is a required field per schema (UI only, not persisted) */
  isRequired?: boolean;
};

// Custom mapping configuration using UI-extended KeyValueMappingEntry
export type CustomMappingConfig = {
  type: MappingTarget;
  rootConfig?: RootMappingConfig;
  keyValueMapConfig?: {
    entries: KeyValueMappingEntry[];
  };
};

// Per-field mapping config using UI-extended CustomMappingConfig
export type FieldMappingConfig = {
  mode: MappingMode;
  custom?: CustomMappingConfig;
};

// Complete mapping config for all three fields (UI version with extended types)
export type MappingConfig = {
  input: FieldMappingConfig;
  expectedOutput: FieldMappingConfig;
  metadata: FieldMappingConfig;
};

// Default mapping config
export const DEFAULT_MAPPING_CONFIG: MappingConfig = {
  input: { mode: "full" },
  expectedOutput: { mode: "full" },
  metadata: { mode: "none" },
};

// Observation data for preview
export type ObservationPreviewData = {
  id: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

// Prop groups for each step
export type DatasetChoiceStepProps = {
  onSelectMode: (mode: "create" | "select") => void;
};

export type DatasetSelectStepProps = {
  projectId: string;
  selectedDatasetId: string | null;
  selectedDatasetName: string | null;
  onDatasetSelect: (
    id: string,
    name: string,
    inputSchema: unknown,
    expectedOutputSchema: unknown,
  ) => void;
  onContinue: () => void;
  canContinue: boolean;
};

export type DatasetCreateStepProps = {
  projectId: string;
  onDatasetCreated: (params: {
    id: string;
    name: string;
    inputSchema: unknown;
    expectedOutputSchema: unknown;
  }) => void;
  onValidationChange?: (isValid: boolean, isSubmitting: boolean) => void;
  onSubmitHandlerReady?: (handler: () => void) => void;
};

// Schema validation error type
export type SchemaValidationError = {
  path: string;
  message: string;
};

// Mapping step props (reusable for Input/Output/Metadata)
export type MappingStepProps = {
  field: "input" | "expectedOutput" | "metadata";
  fieldLabel: string;
  defaultSourceField: SourceField;
  config: FieldMappingConfig;
  onConfigChange: (config: FieldMappingConfig) => void;
  observationData: ObservationPreviewData | null;
  isLoading: boolean;
  /** JSON Schema for this field (inputSchema for input, expectedOutputSchema for expectedOutput) */
  schema?: unknown;
  /** Callback when validation state changes */
  onValidationChange?: (
    isValid: boolean,
    errors: SchemaValidationError[],
  ) => void;
};

// Final preview step props
export type FinalPreviewStepProps = {
  projectId: string;
  datasetId: string;
  datasetName: string;
  mappingConfig: MappingConfig;
  observationData: ObservationPreviewData | null;
  totalCount: number;
  onEditStep: (step: DialogStep) => void;
};

export type StatusStepProps = {
  projectId: string;
  batchActionId: string;
  datasetId: string;
  datasetName: string;
  expectedCount: number;
  onClose: () => void;
};

// Parent component state
export type AddObservationsDialogState = {
  step: DialogStep;
  datasetId: string | null;
  datasetName: string | null;
  mappingConfig: MappingConfig;
  batchActionId: string | null;
};
