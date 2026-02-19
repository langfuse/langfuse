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
import type { BatchActionQuery } from "@langfuse/shared";

// Step components
import { DatasetChoiceStep } from "./DatasetChoiceStep";
import { DatasetSelectStep } from "./DatasetSelectStep";
import { DatasetCreateStep } from "./DatasetCreateStep";
import { MappingStep } from "./MappingStep";
import { FinalPreviewStep } from "./FinalPreviewStep";
import { StatusStep } from "./StatusStep";

// Hook
import { useAddToDatasetWizard } from "./useAddToDatasetWizard";

type AddObservationsToDatasetDialogProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
  exampleObservation: {
    id: string;
    traceId: string;
    startTime?: Date;
  };
};

export function AddObservationsToDatasetDialog(
  props: AddObservationsToDatasetDialogProps,
) {
  const { projectId, onClose } = props;

  const {
    state,
    formRef,
    observationData,
    isLoadingObservation,
    displayCount,
    selectMode,
    goBack,
    goToStep,
    handleNextClick,
    handleDatasetSelect,
    handleDatasetCreated,
    handleInputConfigChange,
    handleOutputConfigChange,
    handleMetadataConfigChange,
    handleCreateValidationChange,
    handleInputValidationChange,
    handleOutputValidationChange,
    isNextDisabled,
    nextButtonLabel,
    dialogDescription,
    showBackButton,
    canClose,
    isLoading,
  } = useAddToDatasetWizard(props);

  const { step } = state;

  return (
    <Dialog open onOpenChange={(open) => !open && canClose && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>
            Add {displayCount} Observation(s) to dataset
            {!["select", "create", "choice"].includes(step)
              ? " " + state.dataset.name
              : ""}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto p-0">
          {step === "choice" && <DatasetChoiceStep onSelectMode={selectMode} />}

          {step === "select" && (
            <DatasetSelectStep
              projectId={projectId}
              dataset={state.dataset}
              onDatasetSelect={handleDatasetSelect}
            />
          )}

          {step === "create" && (
            <DatasetCreateStep
              projectId={projectId}
              formRef={formRef}
              onDatasetCreated={handleDatasetCreated}
              onValidationChange={handleCreateValidationChange}
            />
          )}

          {step === "input-mapping" && (
            <MappingStep
              field="input"
              fieldLabel="Input"
              defaultSourceField="input"
              config={state.mapping.input}
              onConfigChange={handleInputConfigChange}
              observationData={observationData}
              isLoading={isLoadingObservation}
              schema={state.dataset.inputSchema}
              onValidationChange={handleInputValidationChange}
            />
          )}

          {step === "output-mapping" && (
            <MappingStep
              field="expectedOutput"
              fieldLabel="Expected Output"
              defaultSourceField="output"
              config={state.mapping.expectedOutput}
              onConfigChange={handleOutputConfigChange}
              observationData={observationData}
              isLoading={isLoadingObservation}
              schema={state.dataset.expectedOutputSchema}
              onValidationChange={handleOutputValidationChange}
            />
          )}

          {step === "metadata-mapping" && (
            <MappingStep
              field="metadata"
              fieldLabel="Metadata"
              defaultSourceField="metadata"
              config={state.mapping.metadata}
              onConfigChange={handleMetadataConfigChange}
              observationData={observationData}
              isLoading={isLoadingObservation}
            />
          )}

          {step === "preview" && state.dataset.id && state.dataset.name && (
            <FinalPreviewStep
              dataset={{ id: state.dataset.id, name: state.dataset.name }}
              mapping={state.mapping}
              observationData={observationData}
              totalCount={displayCount}
              onEditStep={goToStep}
            />
          )}

          {step === "status" &&
            state.submission.batchActionId &&
            state.dataset.id &&
            state.dataset.name && (
              <StatusStep
                projectId={projectId}
                batchActionId={state.submission.batchActionId}
                dataset={{ id: state.dataset.id, name: state.dataset.name }}
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
                <Button type="button" variant="ghost" onClick={goBack}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
              )}
            </div>
            <div>
              <Button
                onClick={handleNextClick}
                disabled={isNextDisabled}
                loading={isLoading}
              >
                {nextButtonLabel}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
