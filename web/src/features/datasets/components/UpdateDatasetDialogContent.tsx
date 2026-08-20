import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import { type Prisma } from "@langfuse/shared";

export interface UpdateDatasetDialogProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetMetadata?: Prisma.JsonValue;
  datasetInputSchema?: Prisma.JsonValue;
  datasetExpectedOutputSchema?: Prisma.JsonValue;
}

interface UpdateDatasetDialogContentProps extends UpdateDatasetDialogProps {
  onFormSuccess: () => void;
}

export function UpdateDatasetDialogContent({
  onFormSuccess,
  ...props
}: UpdateDatasetDialogContentProps) {
  return (
    <DialogContent className="max-h-[90vh] sm:max-w-2xl md:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Update dataset</DialogTitle>
      </DialogHeader>
      <DatasetForm
        mode="update"
        projectId={props.projectId}
        onFormSuccess={onFormSuccess}
        datasetId={props.datasetId}
        datasetName={props.datasetName}
        datasetDescription={props.datasetDescription}
        datasetMetadata={props.datasetMetadata}
        datasetInputSchema={props.datasetInputSchema}
        datasetExpectedOutputSchema={props.datasetExpectedOutputSchema}
      />
    </DialogContent>
  );
}
