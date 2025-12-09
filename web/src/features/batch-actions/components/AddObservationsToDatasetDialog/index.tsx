import { useState, useCallback } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { ChevronLeft } from "lucide-react";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import type { BatchActionQuery } from "@langfuse/shared";

// Step components
import { DatasetChoiceStep } from "./DatasetChoiceStep";
import { DatasetSelectStep } from "./DatasetSelectStep";
import { DatasetCreateStep } from "./DatasetCreateStep";
import { MappingStep } from "./MappingStep";
import { FinalPreviewStep } from "./FinalPreviewStep";
import { StatusStep } from "./StatusStep";

// Types
import type {
  DialogStep,
  MappingConfig,
  FieldMappingConfig,
  ObservationPreviewData,
  SchemaValidationError,
} from "./types";
import { DEFAULT_MAPPING_CONFIG } from "./types";

type AddObservationsToDatasetDialogProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
  // Example observation data for preview
  exampleObservation: {
    id: string;
    traceId: string;
    startTime?: Date;
  };
};

export function AddObservationsToDatasetDialog(
  props: AddObservationsToDatasetDialogProps,
) {
  const {
    projectId,
    selectedObservationIds,
    query,
    selectAll,
    totalCount,
    onClose,
    exampleObservation,
  } = props;

  // State management
  const [step, setStep] = useState<DialogStep>("choice");
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState<string | null>(null);
  const [datasetInputSchema, setDatasetInputSchema] = useState<unknown>(null);
  const [datasetExpectedOutputSchema, setDatasetExpectedOutputSchema] =
    useState<unknown>(null);
  const [mappingConfig, setMappingConfig] = useState<MappingConfig>(
    DEFAULT_MAPPING_CONFIG,
  );
  const [batchActionId, setBatchActionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create step state
  const [canContinueFromCreate, setCanContinueFromCreate] = useState(false);
  const [isCreatingDataset, setIsCreatingDataset] = useState(false);
  const [createDatasetHandler, setCreateDatasetHandler] = useState<{
    handler: (() => void) | null;
  }>({ handler: null });

  // Mapping step validation state
  const [inputMappingValid, setInputMappingValid] = useState(true);
  const [outputMappingValid, setOutputMappingValid] = useState(true);

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
  // The API returns the observation directly, not wrapped in an 'observation' property
  const observationData: ObservationPreviewData | null = observationQuery.data
    ? {
        id: observationQuery.data.id,
        input: observationQuery.data.input,
        output: observationQuery.data.output,
        metadata: observationQuery.data.metadata,
      }
    : null;

  // Mutations
  const createBatchAction = api.batchAction.addToDataset.create.useMutation({
    onSuccess: (data) => {
      setBatchActionId(data.id);
      setStep("status");
    },
    onError: (error) => {
      showErrorToast("Failed to schedule action", error.message);
      setIsSubmitting(false);
    },
  });

  // Display count
  const displayCount = selectAll ? totalCount : selectedObservationIds.length;

  // Step navigation handlers
  const handleSelectMode = (mode: "create" | "select") => {
    setStep(mode);
  };

  const handleDatasetSelect = (
    id: string,
    name: string,
    inputSchema: unknown,
    expectedOutputSchema: unknown,
  ) => {
    setDatasetId(id);
    setDatasetName(name);
    setDatasetInputSchema(inputSchema);
    setDatasetExpectedOutputSchema(expectedOutputSchema);
  };

  const handleDatasetCreated = (id: string, name: string) => {
    setDatasetId(id);
    setDatasetName(name);
    setStep("input-mapping");
  };

  const handleContinueToInputMapping = () => {
    setStep("input-mapping");
  };

  const handleMappingConfigChange = (
    field: "input" | "expectedOutput" | "metadata",
    config: FieldMappingConfig,
  ) => {
    setMappingConfig((prev) => ({
      ...prev,
      [field]: config,
    }));
  };

  const handleCreateValidationChange = useCallback(
    (isValid: boolean, isSubmitting: boolean) => {
      setCanContinueFromCreate(isValid);
      setIsCreatingDataset(isSubmitting);
    },
    [],
  );

  const handleCreateHandlerReady = useCallback((handler: () => void) => {
    setCreateDatasetHandler({ handler });
  }, []);

  const handleInputValidationChange = useCallback(
    (isValid: boolean, _errors: SchemaValidationError[]) => {
      setInputMappingValid(isValid);
    },
    [],
  );

  const handleOutputValidationChange = useCallback(
    (isValid: boolean, _errors: SchemaValidationError[]) => {
      setOutputMappingValid(isValid);
    },
    [],
  );

  const handleSubmit = async () => {
    if (!datasetId || !datasetName) return;

    setIsSubmitting(true);

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
        datasetId,
        datasetName,
        mapping: mappingConfig,
      },
    });
  };

  const handleBack = () => {
    switch (step) {
      case "select":
      case "create":
        setStep("choice");
        break;
      case "input-mapping":
        // Go back to dataset selection/creation step
        setStep("choice");
        break;
      case "output-mapping":
        setStep("input-mapping");
        break;
      case "metadata-mapping":
        setStep("output-mapping");
        break;
      case "preview":
        setStep("metadata-mapping");
        break;
      default:
        break;
    }
  };

  const handleNext = () => {
    switch (step) {
      case "input-mapping":
        setStep("output-mapping");
        break;
      case "output-mapping":
        setStep("metadata-mapping");
        break;
      case "metadata-mapping":
        setStep("preview");
        break;
      default:
        break;
    }
  };

  const handleEditStep = (targetStep: DialogStep) => {
    setStep(targetStep);
  };

  // Determine if we can proceed at each step
  const canContinueFromSelect = !!datasetId && !!datasetName;

  // Determine dialog description based on step
  const getDialogDescription = () => {
    switch (step) {
      case "choice":
        return "Choose where to add your observations";
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
  };

  // Determine if we should show back button
  const showBackButton = step !== "choice" && step !== "status";

  // Determine if we can close the dialog
  const canClose = step !== "status";

  // Get the next button label based on current step
  const getNextButtonLabel = () => {
    switch (step) {
      case "select":
        return "Continue";
      case "create":
        return isCreatingDataset ? "Creating..." : "Create & Continue";
      case "input-mapping":
      case "output-mapping":
      case "metadata-mapping":
        return "Next";
      case "preview":
        return isSubmitting ? "Adding..." : "Add to Dataset";
      default:
        return "Continue";
    }
  };

  // Check if next button should be disabled
  const isNextDisabled = () => {
    switch (step) {
      case "select":
        return !canContinueFromSelect;
      case "create":
        return !canContinueFromCreate || isCreatingDataset;
      case "input-mapping":
        // Block if schema validation fails (only when schema exists)
        return datasetInputSchema !== null && !inputMappingValid;
      case "output-mapping":
        // Block if schema validation fails (only when schema exists)
        return datasetExpectedOutputSchema !== null && !outputMappingValid;
      case "preview":
        return isSubmitting;
      default:
        return false;
    }
  };

  // Handle next button click
  const handleNextClick = () => {
    switch (step) {
      case "select":
        handleContinueToInputMapping();
        break;
      case "create":
        createDatasetHandler.handler?.();
        break;
      case "input-mapping":
      case "output-mapping":
      case "metadata-mapping":
        handleNext();
        break;
      case "preview":
        handleSubmit();
        break;
      default:
        break;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && canClose && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>
            Add {displayCount} Observation(s) to dataset
            {!["select", "create", "choice"].includes(step)
              ? " " + datasetName
              : ""}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {getDialogDescription()}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto">
          {step === "choice" && (
            <DatasetChoiceStep onSelectMode={handleSelectMode} />
          )}

          {step === "select" && (
            <DatasetSelectStep
              projectId={projectId}
              selectedDatasetId={datasetId}
              selectedDatasetName={datasetName}
              onDatasetSelect={handleDatasetSelect}
              onContinue={handleContinueToInputMapping}
              canContinue={canContinueFromSelect}
            />
          )}

          {step === "create" && (
            <DatasetCreateStep
              projectId={projectId}
              onDatasetCreated={handleDatasetCreated}
              onValidationChange={handleCreateValidationChange}
              onSubmitHandlerReady={handleCreateHandlerReady}
            />
          )}

          {step === "input-mapping" && (
            <MappingStep
              field="input"
              fieldLabel="Input"
              defaultSourceField="input"
              config={mappingConfig.input}
              onConfigChange={(config) =>
                handleMappingConfigChange("input", config)
              }
              observationData={observationData}
              isLoading={observationQuery.isLoading}
              schema={datasetInputSchema}
              onValidationChange={handleInputValidationChange}
            />
          )}

          {step === "output-mapping" && (
            <MappingStep
              field="expectedOutput"
              fieldLabel="Expected Output"
              defaultSourceField="output"
              config={mappingConfig.expectedOutput}
              onConfigChange={(config) =>
                handleMappingConfigChange("expectedOutput", config)
              }
              observationData={observationData}
              isLoading={observationQuery.isLoading}
              schema={datasetExpectedOutputSchema}
              onValidationChange={handleOutputValidationChange}
            />
          )}

          {step === "metadata-mapping" && (
            <MappingStep
              field="metadata"
              fieldLabel="Metadata"
              defaultSourceField="metadata"
              config={mappingConfig.metadata}
              onConfigChange={(config) =>
                handleMappingConfigChange("metadata", config)
              }
              observationData={observationData}
              isLoading={observationQuery.isLoading}
            />
          )}

          {step === "preview" && datasetId && datasetName && (
            <FinalPreviewStep
              projectId={projectId}
              datasetId={datasetId}
              datasetName={datasetName}
              mappingConfig={mappingConfig}
              observationData={observationData}
              totalCount={displayCount}
              onEditStep={handleEditStep}
            />
          )}

          {step === "status" && batchActionId && datasetId && datasetName && (
            <StatusStep
              projectId={projectId}
              batchActionId={batchActionId}
              datasetId={datasetId}
              datasetName={datasetName}
              expectedCount={displayCount}
              onClose={onClose}
            />
          )}
        </DialogBody>

        {/* Footer with navigation buttons */}
        {step !== "status" && step !== "choice" && (
          <DialogFooter className="flex justify-between">
            <div className="flex-grow">
              {showBackButton && (
                <Button type="button" variant="ghost" onClick={handleBack}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
              )}
            </div>
            <div>
              <Button
                onClick={handleNextClick}
                disabled={isNextDisabled()}
                loading={
                  step === "create"
                    ? isCreatingDataset
                    : step === "preview"
                      ? isSubmitting
                      : false
                }
              >
                {getNextButtonLabel()}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
