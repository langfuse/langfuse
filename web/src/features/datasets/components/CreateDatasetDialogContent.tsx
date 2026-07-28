import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";

export function CreateDatasetDialogContent({
  projectId,
  folderPrefix,
  onFormSuccess,
}: {
  projectId: string;
  folderPrefix?: string;
  onFormSuccess: () => void;
}) {
  return (
    <DialogContent className="max-h-[90vh] sm:max-w-2xl md:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Create new dataset</DialogTitle>
      </DialogHeader>
      <DatasetForm
        mode="create"
        projectId={projectId}
        onFormSuccess={onFormSuccess}
        folderPrefix={folderPrefix}
      />
    </DialogContent>
  );
}
