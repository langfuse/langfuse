import { DatasetForm } from "@/src/features/datasets";
import type { DatasetInfo } from "./types";

export function DatasetCreateStep(props: {
  projectId: string;
  onDatasetCreated: (dataset: DatasetInfo) => void;
  onSubmittingChange: (pending: boolean) => void;
  onCancel: () => void;
}) {
  const { projectId, onDatasetCreated, onSubmittingChange, onCancel } = props;

  return (
    <DatasetForm
      projectId={projectId}
      mode="create"
      redirectOnSuccess={false}
      onCreateDatasetSuccess={onDatasetCreated}
      onSubmittingChange={onSubmittingChange}
      onCancel={onCancel}
    />
  );
}
