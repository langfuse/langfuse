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
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import type { BatchActionQuery } from "@langfuse/shared";

// Step components
import { DatasetChoiceStep } from "./DatasetChoiceStep";
import { DatasetSelectStep } from "./DatasetSelectStep";
import { DatasetCreateStep } from "./DatasetCreateStep";
import { FieldMappingStep } from "./FieldMappingStep";
import { StatusStep } from "./StatusStep";

// Types
import type { DialogStep, MappingConfig } from "./types";

type AddObservationsToDatasetDialogProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
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
  } = props;

  // State management
  const [step, setStep] = useState<DialogStep>("choice");
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState<string | null>(null);
  const [mappingConfig, setMappingConfig] = useState<MappingConfig>({
    inputMappings: [{ sourceField: "input" as const }],
    expectedOutputMappings: undefined,
    metadataMappings: undefined,
  });
  const [batchActionId, setBatchActionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create step state
  const [canContinueFromCreate, setCanContinueFromCreate] = useState(false);
  const [isCreatingDataset, setIsCreatingDataset] = useState(false);
  const [createDatasetHandler, setCreateDatasetHandler] = useState<{
    handler: (() => void) | null;
  }>({ handler: null });

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

  const handleDatasetSelect = (id: string, name: string) => {
    setDatasetId(id);
    setDatasetName(name);
  };

  const handleDatasetCreated = (id: string, name: string) => {
    setDatasetId(id);
    setDatasetName(name);
    setStep("mapping");
  };

  const handleContinueToMapping = () => {
    setStep("mapping");
  };

  const handleMappingChange = (config: MappingConfig) => {
    setMappingConfig(config);
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

  const handleSubmitMapping = async () => {
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
    if (step === "select" || step === "create") {
      setStep("choice");
    } else if (step === "mapping") {
      // Go back to the appropriate step based on whether dataset was created or selected
      // For simplicity, always go back to choice to allow changing the selection
      setStep("choice");
    }
  };

  // Determine if we can proceed at each step
  const canContinueFromSelect = !!datasetId && !!datasetName;
  const canSubmitMapping = !!datasetId && !!datasetName && !isSubmitting;

  // Determine dialog description based on step
  const getDialogDescription = () => {
    switch (step) {
      case "choice":
        return "Choose where to add your observations";
      case "select":
        return "Select an existing dataset";
      case "create":
        return "Create a new dataset";
      case "mapping":
        return "Configure how data is mapped";
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

  return (
    <Dialog open onOpenChange={(open) => !open && canClose && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Add {displayCount} Observations to Dataset</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
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
              onContinue={handleContinueToMapping}
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

          {step === "mapping" && datasetId && datasetName && (
            <FieldMappingStep
              projectId={projectId}
              datasetId={datasetId}
              datasetName={datasetName}
              selectedObservationIds={selectedObservationIds}
              query={query}
              selectAll={selectAll}
              mappingConfig={mappingConfig}
              onMappingChange={handleMappingChange}
              onSubmit={handleSubmitMapping}
              isSubmitting={isSubmitting}
              canSubmit={canSubmitMapping}
            />
          )}

          {step === "status" && batchActionId && datasetId && datasetName && (
            <StatusStep
              projectId={projectId}
              batchActionId={batchActionId}
              datasetId={datasetId}
              datasetName={datasetName}
              onClose={onClose}
            />
          )}
        </DialogBody>

        {/* Footer with navigation buttons */}
        {step !== "status" && (
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
              {step === "select" && (
                <Button
                  onClick={handleContinueToMapping}
                  disabled={!canContinueFromSelect}
                >
                  Continue
                </Button>
              )}
              {step === "create" && (
                <Button
                  onClick={() => createDatasetHandler.handler?.()}
                  disabled={!canContinueFromCreate || isCreatingDataset}
                  loading={isCreatingDataset}
                >
                  Create & Continue
                </Button>
              )}
              {step === "mapping" && (
                <Button
                  onClick={handleSubmitMapping}
                  disabled={!canSubmitMapping}
                >
                  {isSubmitting ? "Adding..." : "Add to Dataset"}
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
