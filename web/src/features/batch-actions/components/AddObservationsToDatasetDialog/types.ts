import type { BatchActionQuery } from "@langfuse/shared";

// Step definitions
export type DialogStep = "choice" | "select" | "create" | "mapping" | "status";

// Mapping configuration
export type FieldMapping = {
  sourceField: "input" | "output" | "metadata";
  jsonPath?: string;
  targetKey?: string;
};

export type MappingConfig = {
  inputMappings: FieldMapping[];
  expectedOutputMappings?: FieldMapping[];
  metadataMappings?: FieldMapping[];
};

// Prop groups for each step
export type DatasetChoiceStepProps = {
  onSelectMode: (mode: "create" | "select") => void;
};

export type DatasetSelectStepProps = {
  projectId: string;
  selectedDatasetId: string | null;
  selectedDatasetName: string | null;
  onDatasetSelect: (id: string, name: string) => void;
  onContinue: () => void;
  canContinue: boolean;
};

export type DatasetCreateStepProps = {
  projectId: string;
  onDatasetCreated: (id: string, name: string) => void;
  onValidationChange?: (isValid: boolean, isSubmitting: boolean) => void;
  onSubmitHandlerReady?: (handler: () => void) => void;
};

export type FieldMappingStepProps = {
  projectId: string;
  datasetId: string;
  datasetName: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  mappingConfig: MappingConfig;
  onMappingChange: (config: MappingConfig) => void;
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  canSubmit: boolean;
};

export type StatusStepProps = {
  projectId: string;
  batchActionId: string;
  datasetId: string;
  datasetName: string;
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
