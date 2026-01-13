import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import type { DatasetCreateStepProps } from "./types";

export function DatasetCreateStep(props: DatasetCreateStepProps) {
  const { projectId, formRef, onDatasetCreated, onValidationChange } = props;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium">Create New Dataset</h3>
        <p className="text-sm text-muted-foreground">
          Fill in the details to create a new dataset
        </p>
      </div>

      <DatasetForm
        ref={formRef}
        projectId={projectId}
        mode="create"
        redirectOnSuccess={false}
        showFooter={false}
        onCreateDatasetSuccess={onDatasetCreated}
        onValidationChange={onValidationChange}
      />
    </div>
  );
}
