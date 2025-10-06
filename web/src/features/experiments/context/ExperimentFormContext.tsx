import React, { createContext, useContext, type ReactNode } from "react";
import { type UseFormReturn } from "react-hook-form";
import { type CreateExperiment } from "@/src/features/experiments/types";
import { type UIModelParams } from "@langfuse/shared/src/server";
import { type ModelParamsContext } from "@/src/components/ModelParameters";
import { type EvalTemplate, type PromptType } from "@langfuse/shared";

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
  evaluator: {
    id?: string;
    [key: string]: any;
  };
}

export type ExperimentFormContextType = {
  // Form state
  form: UseFormReturn<CreateExperiment>;

  // Project
  projectId: string;

  // Prompt state
  selectedPromptName: string;
  setSelectedPromptName: (name: string) => void;
  selectedPromptVersion: number | null;
  setSelectedPromptVersion: (version: number | null) => void;
  promptsByName:
    | Record<string, Array<{ id: string; version: number }>>
    | undefined;
  expectedColumns: string[] | undefined;

  // Model state
  modelParams: UIModelParams;
  updateModelParamValue: ModelParamsContext["updateModelParamValue"];
  setModelParamEnabled: ModelParamsContext["setModelParamEnabled"];
  availableModels: string[];
  providerModelCombinations: string[];
  availableProviders: string[];

  // Structured output state
  structuredOutputEnabled: boolean;
  setStructuredOutputEnabled: (enabled: boolean) => void;
  selectedSchemaName: string | null;
  setSelectedSchemaName: (name: string | null) => void;

  // Dataset state
  datasets:
    | Array<{ id: string; name: string; countDatasetItems: number }>
    | undefined;
  selectedDatasetId: string | null;
  selectedDataset:
    | { id: string; name: string; countDatasetItems: number }
    | undefined;
  validationResult: ValidationResult;
  expectedColumnsForDataset: {
    inputVariables: string[];
    outputVariableType: PromptType;
    outputVariableName: string;
  };

  // Evaluator state
  activeEvaluators: string[];
  inActiveEvaluators: string[];
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

  // Run details
  runName: string;

  // Permissions
  hasEvalReadAccess: boolean;
  hasEvalWriteAccess: boolean;
};

const ExperimentFormContext = createContext<
  ExperimentFormContextType | undefined
>(undefined);

export const useExperimentFormContext = () => {
  const context = useContext(ExperimentFormContext);
  if (!context) {
    throw new Error(
      "useExperimentFormContext must be used within ExperimentFormProvider",
    );
  }
  return context;
};

interface ExperimentFormProviderProps {
  children: ReactNode;
  value: ExperimentFormContextType;
}

export const ExperimentFormProvider: React.FC<ExperimentFormProviderProps> = ({
  children,
  value,
}) => {
  return (
    <ExperimentFormContext.Provider value={value}>
      {children}
    </ExperimentFormContext.Provider>
  );
};
