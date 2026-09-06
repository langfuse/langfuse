import { useReducer, useCallback, useMemo, useRef } from "react";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import type { BatchActionQuery } from "@langfuse/shared";
import type { DatasetFormRef } from "@/src/features/datasets/components/DatasetForm";
import type {
  DatasetInfo,
  DialogStep,
  FieldMappingConfig,
  ObservationPreviewData,
  SchemaValidationError,
} from "./types";
import { wizardReducer, initialWizardState } from "./wizardReducer";
import { useTranslations } from "next-intl";

export type UseAddToDatasetWizardProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  exampleObservation: {
    id: string;
    traceId: string;
    startTime?: Date;
  };
};

export function useAddToDatasetWizard(props: UseAddToDatasetWizardProps) {
  const t = useTranslations("operationsUi.batchActions.addToDataset");
  const {
    projectId,
    selectedObservationIds,
    query,
    selectAll,
    totalCount,
    exampleObservation,
  } = props;

  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);

  // Ref for DatasetForm imperative submit
  const formRef = useRef<DatasetFormRef>(null);

  // Get example observation for preview
  const observationQuery = api.observations.byId.useQuery(
    {
      observationId: exampleObservation.id,
      traceId: exampleObservation.traceId,
      projectId,
      startTime: exampleObservation.startTime,
    },
    {
      enabled: true,
    },
  );

  // Transform observation data for preview
  const observationData: ObservationPreviewData | null = observationQuery.data
    ? {
        id: observationQuery.data.id,
        input: observationQuery.data.input,
        output: observationQuery.data.output,
        metadata: observationQuery.data.metadata,
      }
    : null;

  // Mutation for creating batch action
  const createBatchAction = api.batchAction.addToDataset.create.useMutation({
    onSuccess: (data) => {
      dispatch({ type: "SUBMIT_SUCCESS", batchActionId: data.id });
    },
    onError: (error) => {
      showErrorToast(t("failedToSchedule"), error.message);
      dispatch({ type: "SUBMIT_ERROR" });
    },
  });

  // Display count
  const displayCount = selectAll ? totalCount : selectedObservationIds.length;

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

    // If not selecting all, inject ID filter to only process selected observations
    const finalQuery = selectAll
      ? query
      : {
          ...query,
          filter: [
            ...(query.filter || []),
            {
              column: "id",
              operator: "any of" as const,
              value: selectedObservationIds,
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
    selectedObservationIds,
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

  const handleMappingConfigChange = useCallback(
    (
      field: "input" | "expectedOutput" | "metadata",
      config: FieldMappingConfig,
    ) => {
      dispatch({ type: "UPDATE_MAPPING", field, config });
    },
    [],
  );

  // Pre-bound callbacks for each mapping field to avoid inline functions in JSX
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
        // Block if schema validation fails (only when schema exists)
        return (
          state.dataset.inputSchema !== null && !state.validation.inputMapping
        );
      case "output-mapping":
        // Block if schema validation fails (only when schema exists)
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
        return t("buttons.continue");
      case "create":
        return state.createStep.isCreating
          ? t("buttons.creating")
          : t("buttons.createAndContinue");
      case "input-mapping":
      case "output-mapping":
      case "metadata-mapping":
        return t("buttons.next");
      case "preview":
        return state.submission.isSubmitting
          ? t("buttons.adding")
          : t("buttons.addToDataset");
      default:
        return t("buttons.continue");
    }
  }, [
    state.step,
    state.createStep.isCreating,
    state.submission.isSubmitting,
    t,
  ]);

  const dialogDescription = useMemo(() => {
    switch (state.step) {
      case "choice":
        return t("descriptions.choice");
      case "select":
        return t("descriptions.select");
      case "create":
        return t("descriptions.create");
      case "input-mapping":
        return t("descriptions.inputMapping");
      case "output-mapping":
        return t("descriptions.outputMapping");
      case "metadata-mapping":
        return t("descriptions.metadataMapping");
      case "preview":
        return t("descriptions.preview");
      case "status":
        return t("descriptions.status");
      default:
        return "";
    }
  }, [state.step, t]);

  const showBackButton = state.step !== "choice" && state.step !== "status";
  const canClose = !state.submission.isSubmitting;
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
    observationData,
    isLoadingObservation: observationQuery.isLoading,
    displayCount,

    // Actions
    selectMode,
    goBack,
    goToStep,
    handleNextClick,

    // Child component callbacks
    handleDatasetSelect,
    handleDatasetCreated,
    handleMappingConfigChange,
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
