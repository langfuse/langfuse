import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

export function DeleteTraceDialogContent({
  closeDialog,
  projectId,
  traceId,
}: {
  closeDialog: () => void;
  projectId: string;
  traceId: string;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const traceMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      capture("trace:delete", { source: "table-single-row" });
      showSuccessToast({
        title: "Trace deleted",
        description:
          "Selected trace will be deleted. Traces are removed asynchronously and may continue to be visible for up to 24 hours.",
      });
      utils.traces.all.invalidate();
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
          This action cannot be undone. It removes all the data associated with
          this trace.
        </p>
      </DialogBody>
      <DialogFooter>
        <div className="flex gap-2">
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={traceMutation.isPending}
            onClick={() =>
              traceMutation.mutate({ traceIds: [traceId], projectId })
            }
          >
            Delete trace
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
