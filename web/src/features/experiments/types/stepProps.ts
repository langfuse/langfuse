import { type UseFormReturn } from "react-hook-form";
import { type CreateExperiment } from "@/src/features/experiments/types";
import { type UIModelParams } from "@langfuse/shared/src/server";
import { type ModelParamsContext } from "@/src/components/ModelParameters";
import { type EvalTemplate, type PromptType } from "@langfuse/shared";
import { type PartialConfig } from "@/src/features/evals/types";

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
export type FormState = {
  form: UseFormReturn<CreateExperiment>;
};

export type NavigationState = {
  setActiveStep: (step: string) => void;
};

export type PermissionsState = {
  hasEvalReadAccess: boolean;
  hasEvalWriteAccess: boolean;
};

// Domain-specific grouped state
export type PromptModelState = {
  selectedPromptName: string;
  setSelectedPromptName: (name: string) => void;
  selectedPromptVersion: number | null;
  setSelectedPromptVersion: (version: number | null) => void;
  promptsByName:
    | Record<string, Array<{ id: string; version: number; labels: string[] }>>
    | undefined;
};

export type ModelState = {
  modelParams: UIModelParams;
  updateModelParamValue: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  availableModels: string[];
  providerModelCombinations: string[];
  availableProviders: string[];
};

export type StructuredOutputState = {
  structuredOutputEnabled: boolean;
  setStructuredOutputEnabled: (enabled: boolean) => void;
  selectedSchemaName: string | null;
  setSelectedSchemaName: (name: string | null) => void;
};

export type DatasetState = {
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

export type EvaluatorState = {
  activeEvaluators: string[];
  pausedEvaluators: string[];
  evaluatorTargetObjects: Record<string, string>;
  evalTemplates: EvalTemplate[];
  activeEvaluatorNames: string[];
  selectedEvaluatorData: EvaluatorData | null;
  showEvaluatorForm: boolean;
  handleConfigureEvaluator: (templateId: string) => void;
  handleCloseEvaluatorForm: () => void;
  handleEvaluatorSuccess: () => void;
  handleSelectEvaluator: (templateId: string) => void;
  handleEvaluatorToggled: () => void;
  preprocessFormValues: (values: any) => any;
};

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
  evaluatorState: EvaluatorState;
  permissions: PermissionsState;
}

export interface ExperimentDetailsStepProps {
  formState: FormState;
}

export interface ReviewStepProps {
  formState: FormState;
  navigationState: NavigationState;
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
