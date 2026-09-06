import { type UseFormReturn } from "react-hook-form";
import { type CreateExperiment } from "@/src/features/experiments/types";
import { type UIModelParams } from "@langfuse/shared/src/server";
import { type ModelParamsContext } from "@/src/components/ModelParameters";
import {
  type EvalTemplate,
  type PromptToolConfig,
  type PromptType,
} from "@langfuse/shared";
import { type PartialConfig } from "@/src/features/evals/types";
import type {
  RuleDraft,
  RuleEvaluatorOption,
} from "@/src/features/evals/v2/types/rules";
import type { ExperimentEvaluatorAssignmentsHandle } from "@/src/features/experiments/components/ExperimentEvaluatorAssignments/types/experimentEvaluatorAssignmentsHandle";
import type { Ref } from "react";

type ValidationResult =
  | {
      isValid: true;
      totalItems: number;
      variablesMap: Record<string, number>;
    }
  | {
      isValid: false;
      message: string;
    }
  | undefined;

interface EvaluatorData {
  templateId: string;
  evaluator: PartialConfig & { evalTemplate: EvalTemplate };
}

// Shared state types
type FormState = {
  form: UseFormReturn<CreateExperiment>;
};

type NavigationState = {
  setActiveStep: (step: string) => void;
};

type PermissionsState = {
  hasEvalReadAccess: boolean;
  hasEvalWriteAccess: boolean;
};

// Domain-specific grouped state
type PromptModelState = {
  selectedPromptName: string;
  setSelectedPromptName: (name: string) => void;
  selectedPromptVersion: number | null;
  setSelectedPromptVersion: (version: number | null) => void;
  promptsByName:
    | Record<string, Array<{ id: string; version: number; labels: string[] }>>
    | undefined;
  selectedPromptToolConfig: PromptToolConfig;
};

type ModelState = {
  modelParams: UIModelParams;
  updateModelParamValue: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  availableModels: string[];
  providerModelCombinations: string[];
  availableProviders: string[];
};

type StructuredOutputState = {
  structuredOutputEnabled: boolean;
  setStructuredOutputEnabled: (enabled: boolean) => void;
  selectedSchemaName: string | null;
  setSelectedSchemaName: (name: string | null) => void;
};

type DatasetState = {
  datasets: Array<{ id: string; name: string }> | undefined;
  selectedDatasetId: string | null;
  selectedDataset: { id: string; name: string } | undefined;
  selectedDatasetVersion: Date | undefined;
  validationResult: ValidationResult;
  expectedColumnsForDataset: {
    inputVariables: string[];
    outputVariableType: PromptType;
    outputVariableName: string;
  };
};

type LegacyEvaluatorState = {
  version: "legacy";
  evalTemplates: EvalTemplate[];
  activeEvaluatorNames: string[];
  selectedEvaluatorData: EvaluatorData | null;
  showEvaluatorForm: boolean;
  handleConfigureEvaluator: (templateId: string) => void;
  handleCloseEvaluatorForm: () => void;
  handleEvaluatorSuccess: () => void;
  handleSelectEvaluator: (templateId: string) => void;
  preprocessFormValues: (values: any) => any;
};

type V2EvaluatorState = {
  version: "v2";
  evaluatorOptions: RuleEvaluatorOption[];
  selectedAssignments: RuleDraft["assignments"];
  activeEvaluatorNames: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onSaveAssignments: (assignments: RuleDraft["assignments"]) => Promise<void>;
  isLoadingAssignments: boolean;
  isUpdating: boolean;
};

type EvaluatorState = LegacyEvaluatorState | V2EvaluatorState;

// Step-specific prop interfaces
export interface PromptModelStepProps {
  projectId: string;
  formState: FormState;
  promptModelState: PromptModelState;
  modelState: ModelState;
  structuredOutputState: StructuredOutputState;
}

export interface DatasetStepProps {
  projectId: string;
  formState: FormState;
  datasetState: DatasetState;
  promptInfo: {
    selectedPromptName: string;
    selectedPromptVersion: number | null;
  };
}

export interface EvaluatorsStepProps {
  projectId: string;
  datasetId: string | null;
  datasetVersion?: Date;
  evaluatorAssignmentsRef?: Ref<ExperimentEvaluatorAssignmentsHandle>;
  evaluatorState: EvaluatorState;
  permissions: PermissionsState;
}

export interface ExperimentDetailsStepProps {
  formState: FormState;
}

export interface ReviewStepProps {
  formState: FormState;
  navigationState: NavigationState;
  errorMessage?: string;
  summary: {
    selectedPromptName: string;
    selectedPromptVersion: number | null;
    selectedDataset: { id: string; name: string } | undefined;
    modelParams: UIModelParams;
    activeEvaluatorNames: string[];
    structuredOutputEnabled: boolean;
    selectedSchemaName: string | null;
    validationResult: ValidationResult;
  };
}
