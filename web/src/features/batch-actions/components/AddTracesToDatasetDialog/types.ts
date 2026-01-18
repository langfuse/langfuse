// Re-export shared types from observations dialog
// Traces have the same input/output/metadata structure as observations
export type {
  DialogStep,
  FieldMappingConfig,
  MappingConfig,
  DatasetInfo,
  WizardState,
  WizardAction,
  SchemaValidationError,
  DatasetChoiceStepProps,
  DatasetSelectStepProps,
  DatasetCreateStepProps,
  MappingStepProps,
  FinalPreviewStepProps,
  StatusStepProps,
} from "../AddObservationsToDatasetDialog/types";

export { DEFAULT_MAPPING_CONFIG } from "../AddObservationsToDatasetDialog/types";

// Trace-specific preview data (same structure as observations)
export type TracePreviewData = {
  id: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
};
