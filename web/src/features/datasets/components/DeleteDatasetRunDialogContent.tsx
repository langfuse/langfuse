import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";

export function DeleteDatasetRunDialogContent({
  closeDialog,
  projectId,
  datasetId,
  datasetRunId,
}: {
  closeDialog: () => void;
  projectId: string;
  datasetId: string;
  datasetRunId: string;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const deleteDatasetRun = api.datasets.deleteDatasetRuns.useMutation({
    onSuccess: () => {
      utils.datasets.invalidate();
      closeDialog();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Please confirm</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p className="text-muted-foreground py-4 text-sm">
          This action cannot be undone. Traces linked to this run must be
          deleted manually.
        </p>
      </DialogBody>
      <DialogFooter>
        <div className="flex gap-2">
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleteDatasetRun.isPending}
            onClick={() => {
              capture("dataset_run:delete_form_submit");
              deleteDatasetRun.mutate({
                projectId,
                datasetId,
                datasetRunIds: [datasetRunId],
              });
            }}
          >
            Delete Dataset Run
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
