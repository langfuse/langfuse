import { useReducer, useCallback, useMemo, useRef } from "react";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import type { BatchActionQuery } from "@langfuse/shared";
import type { DatasetFormRef } from "@/src/features/datasets/components/DatasetForm";
import type {
  DatasetInfo,
  DialogStep,
  FieldMappingConfig,
  TracePreviewData,
  SchemaValidationError,
} from "./types";
import {
  wizardReducer,
  initialWizardState,
} from "../AddObservationsToDatasetDialog/wizardReducer";

export type UseAddTracesToDatasetWizardProps = {
  projectId: string;
  selectedTraceIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  exampleTrace: {
    id: string;
    timestamp?: Date;
  };
};

export function useAddTracesToDatasetWizard(
  props: UseAddTracesToDatasetWizardProps,
) {
  const {
    projectId,
    selectedTraceIds,
    query,
    selectAll,
    totalCount,
    exampleTrace,
  } = props;

  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);

  // Ref for DatasetForm imperative submit
  const formRef = useRef<DatasetFormRef>(null);

  // Get example trace for preview
  const traceQuery = api.traces.byId.useQuery(
    {
      traceId: exampleTrace.id,
      projectId,
      timestamp: exampleTrace.timestamp,
    },
    {
      enabled: true,
    },
  );

  // Transform trace data for preview
  const traceData: TracePreviewData | null = traceQuery.data
    ? {
        id: traceQuery.data.id,
        input: traceQuery.data.input,
        output: traceQuery.data.output,
        metadata: traceQuery.data.metadata,
      }
    : null;

  // Mutation for creating batch action
  const createBatchAction =
    api.batchAction.addToDataset.createForTraces.useMutation({
      onSuccess: (data) => {
        dispatch({ type: "SUBMIT_SUCCESS", batchActionId: data.id });
      },
      onError: (error) => {
        showErrorToast("Failed to schedule action", error.message);
        dispatch({ type: "SUBMIT_ERROR" });
      },
    });

  // Display count
  const displayCount = selectAll ? totalCount : selectedTraceIds.length;

  // Action dispatchers
  const selectMode = useCallback((mode: "create" | "select") => {
    dispatch({ type: "SELECT_MODE", mode });
  }, []);

  const goNext = useCallback(() => {
    dispatch({ type: "NEXT_STEP" });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: "BACK" });
  }, []);

  const goToStep = useCallback((step: DialogStep) => {
    dispatch({ type: "GO_TO_STEP", step });
  }, []);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!state.dataset.id || !state.dataset.name) return;

    dispatch({ type: "SUBMIT_START" });

    // If not selecting all, inject ID filter to only process selected traces
    const finalQuery = selectAll
      ? query
      : {
          ...query,
          filter: [
            ...(query.filter || []),
            {
              column: "id",
              operator: "any of" as const,
              value: selectedTraceIds,
              type: "stringOptions" as const,
            },
          ],
        };

    await createBatchAction.mutateAsync({
      projectId,
      query: finalQuery,
      config: {
        datasetId: state.dataset.id,
        datasetName: state.dataset.name,
        mapping: state.mapping,
      },
    });
  }, [
    state.dataset.id,
    state.dataset.name,
    state.mapping,
    selectAll,
    query,
    selectedTraceIds,
    projectId,
    createBatchAction,
  ]);

  // Handle next button click - coordinates different actions per step
  const handleNextClick = useCallback(() => {
    switch (state.step) {
      case "select":
        goNext();
        break;
      case "create":
        // Trigger form submission via ref
        formRef.current?.submit();
        break;
      case "input-mapping":
      case "output-mapping":
      case "metadata-mapping":
        goNext();
        break;
      case "preview":
        handleSubmit();
        break;
      default:
        break;
    }
  }, [state.step, goNext, handleSubmit]);

  // Callback adapters for child components
  const handleDatasetSelect = useCallback((dataset: DatasetInfo) => {
    dispatch({ type: "SELECT_DATASET", dataset });
  }, []);

  const handleDatasetCreated = useCallback(
    (params: {
      id: string;
      name: string;
      inputSchema: unknown;
      expectedOutputSchema: unknown;
    }) => {
      dispatch({ type: "DATASET_CREATED", dataset: params });
    },
    [],
  );

  // Pre-bound callbacks for each mapping field
  const handleInputConfigChange = useCallback((config: FieldMappingConfig) => {
    dispatch({ type: "UPDATE_MAPPING", field: "input", config });
  }, []);

  const handleOutputConfigChange = useCallback((config: FieldMappingConfig) => {
    dispatch({ type: "UPDATE_MAPPING", field: "expectedOutput", config });
  }, []);

  const handleMetadataConfigChange = useCallback(
    (config: FieldMappingConfig) => {
      dispatch({ type: "UPDATE_MAPPING", field: "metadata", config });
    },
    [],
  );

  const handleCreateValidationChange = useCallback(
    (isValid: boolean, isCreating: boolean) => {
      dispatch({
        type: "SET_CREATE_VALIDATION",
        canContinue: isValid,
        isCreating,
      });
    },
    [],
  );

  const handleInputValidationChange = useCallback(
    (isValid: boolean, _errors: SchemaValidationError[]) => {
      dispatch({ type: "SET_MAPPING_VALIDATION", field: "input", isValid });
    },
    [],
  );

  const handleOutputValidationChange = useCallback(
    (isValid: boolean, _errors: SchemaValidationError[]) => {
      dispatch({ type: "SET_MAPPING_VALIDATION", field: "output", isValid });
    },
    [],
  );

  // Derived state
  const canContinueFromSelect = useMemo(
    () => !!state.dataset.id && !!state.dataset.name,
    [state.dataset.id, state.dataset.name],
  );

  const isNextDisabled = useMemo(() => {
    switch (state.step) {
      case "select":
        return !canContinueFromSelect;
      case "create":
        return !state.createStep.canContinue || state.createStep.isCreating;
      case "input-mapping":
        return (
          state.dataset.inputSchema !== null && !state.validation.inputMapping
        );
      case "output-mapping":
        return (
          state.dataset.expectedOutputSchema !== null &&
          !state.validation.outputMapping
        );
      case "preview":
        return state.submission.isSubmitting;
      default:
        return false;
    }
  }, [
    state.step,
    canContinueFromSelect,
    state.createStep.canContinue,
    state.createStep.isCreating,
    state.dataset.inputSchema,
    state.dataset.expectedOutputSchema,
    state.validation.inputMapping,
    state.validation.outputMapping,
    state.submission.isSubmitting,
  ]);

  const nextButtonLabel = useMemo(() => {
    switch (state.step) {
      case "select":
        return "Continue";
      case "create":
        return state.createStep.isCreating
          ? "Creating..."
          : "Create & Continue";
      case "input-mapping":
      case "output-mapping":
      case "metadata-mapping":
        return "Next";
      case "preview":
        return state.submission.isSubmitting ? "Adding..." : "Add to Dataset";
      default:
        return "Continue";
    }
  }, [state.step, state.createStep.isCreating, state.submission.isSubmitting]);

  const dialogDescription = useMemo(() => {
    switch (state.step) {
      case "choice":
        return "Choose where to add your traces";
      case "select":
        return "Select an existing dataset";
      case "create":
        return "Create a new dataset";
      case "input-mapping":
        return "Configure dataset item input mapping";
      case "output-mapping":
        return "Configure dataset item expected output mapping";
      case "metadata-mapping":
        return "Configure dataset item metadata mapping";
      case "preview":
        return "Review and confirm your configuration";
      case "status":
        return "Your bulk action status";
      default:
        return "";
    }
  }, [state.step]);

  const showBackButton = state.step !== "choice" && state.step !== "status";
  const canClose = state.step !== "status";
  const isLoading =
    state.step === "create"
      ? state.createStep.isCreating
      : state.step === "preview"
        ? state.submission.isSubmitting
        : false;

  return {
    // State
    state,
    formRef,
    traceData,
    isLoadingTrace: traceQuery.isLoading,
    displayCount,

    // Actions
    selectMode,
    goBack,
    goToStep,
    handleNextClick,

    // Child component callbacks
    handleDatasetSelect,
    handleDatasetCreated,
    handleInputConfigChange,
    handleOutputConfigChange,
    handleMetadataConfigChange,
    handleCreateValidationChange,
    handleInputValidationChange,
    handleOutputValidationChange,

    // Derived state
    isNextDisabled,
    nextButtonLabel,
    dialogDescription,
    showBackButton,
    canClose,
    isLoading,
  };
}
