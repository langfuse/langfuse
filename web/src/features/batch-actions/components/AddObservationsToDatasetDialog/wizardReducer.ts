import type { WizardState, WizardAction, DialogStep } from "./types";
import { DEFAULT_MAPPING_CONFIG } from "./types";

export const initialWizardState: WizardState = {
  step: "choice",
  dataset: {
    id: null,
    name: null,
    inputSchema: null,
    expectedOutputSchema: null,
  },
  mapping: DEFAULT_MAPPING_CONFIG,
  submission: {
    batchActionId: null,
    isSubmitting: false,
  },
  validation: {
    inputMapping: true,
    outputMapping: true,
  },
  createStep: {
    canContinue: false,
    isCreating: false,
  },
};

// Step transition maps for navigation
const NEXT_STEP_MAP: Partial<Record<DialogStep, DialogStep>> = {
  select: "input-mapping",
  "input-mapping": "output-mapping",
  "output-mapping": "metadata-mapping",
  "metadata-mapping": "preview",
};

const BACK_STEP_MAP: Partial<Record<DialogStep, DialogStep>> = {
  select: "choice",
  create: "choice",
  "input-mapping": "choice",
  "output-mapping": "input-mapping",
  "metadata-mapping": "output-mapping",
  preview: "metadata-mapping",
};

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "SELECT_MODE":
      return { ...state, step: action.mode };

    case "NEXT_STEP": {
      const nextStep = NEXT_STEP_MAP[state.step];
      return nextStep ? { ...state, step: nextStep } : state;
    }

    case "BACK": {
      const prevStep = BACK_STEP_MAP[state.step];
      return prevStep ? { ...state, step: prevStep } : state;
    }

    case "GO_TO_STEP":
      return { ...state, step: action.step };

    case "SELECT_DATASET":
      return {
        ...state,
        dataset: {
          id: action.dataset.id,
          name: action.dataset.name,
          inputSchema: action.dataset.inputSchema,
          expectedOutputSchema: action.dataset.expectedOutputSchema,
        },
        // Reset mapping when dataset changes
        mapping: DEFAULT_MAPPING_CONFIG,
        validation: { inputMapping: true, outputMapping: true },
      };

    case "DATASET_CREATED":
      return {
        ...state,
        step: "input-mapping",
        dataset: {
          id: action.dataset.id,
          name: action.dataset.name,
          inputSchema: action.dataset.inputSchema,
          expectedOutputSchema: action.dataset.expectedOutputSchema,
        },
        // Reset mapping for new dataset
        mapping: DEFAULT_MAPPING_CONFIG,
        validation: { inputMapping: true, outputMapping: true },
      };

    case "UPDATE_MAPPING":
      return {
        ...state,
        mapping: {
          ...state.mapping,
          [action.field]: action.config,
        },
      };

    case "SET_MAPPING_VALIDATION":
      return {
        ...state,
        validation: {
          ...state.validation,
          [action.field === "input" ? "inputMapping" : "outputMapping"]:
            action.isValid,
        },
      };

    case "SET_CREATE_VALIDATION":
      return {
        ...state,
        createStep: {
          canContinue: action.canContinue,
          isCreating: action.isCreating,
        },
      };

    case "SUBMIT_START":
      return {
        ...state,
        submission: { ...state.submission, isSubmitting: true },
      };

    case "SUBMIT_SUCCESS":
      return {
        ...state,
        step: "status",
        submission: {
          batchActionId: action.batchActionId,
          isSubmitting: false,
        },
      };

    case "SUBMIT_ERROR":
      return {
        ...state,
        submission: { ...state.submission, isSubmitting: false },
      };

    default:
      return state;
  }
}
