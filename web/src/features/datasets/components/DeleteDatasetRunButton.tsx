import { Trash } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import React, { useState } from "react";
import { useRouter } from "next/router";

export const DeleteDatasetRunButton = ({
  projectId,
  datasetRunId,
  redirectUrl,
}: {
  projectId: string;
  datasetRunId: string;
  redirectUrl?: string;
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();
  const router = useRouter();
  const mutDelete = api.datasets.deleteDatasetRuns.useMutation({
    onSuccess: () => {
      redirectUrl ? router.push(redirectUrl) : utils.datasets.invalidate();
    },
  });

  const button = (
    <Button
      variant="ghost"
      className="w-full"
      disabled={!hasAccess}
      onClick={() => capture("dataset_run:delete_form_open")}
    >
      <div className="flex w-full flex-row items-center gap-1">
        <Trash className="h-4 w-4" />
        <span className="text-sm font-normal">Delete</span>
      </div>
    </Button>
  );

  return hasAccess ? (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(isOpen) => {
        if (!mutDelete.isLoading) {
          setIsDialogOpen(isOpen);
        }
      }}
    >
      <DialogTrigger asChild>{button}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="mb-4">Please confirm</DialogTitle>
          <DialogDescription className="text-md p-0">
            This action cannot be undone. Traces linked to this run must be
            deleted manually.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            loading={mutDelete.isLoading}
            disabled={mutDelete.isLoading}
            onClick={async (event) => {
              event.preventDefault();
              capture("dataset_run:delete_form_submit");
              await mutDelete.mutateAsync({
                projectId,
                datasetRunIds: [datasetRunId],
              });
              setIsDialogOpen(false);
            }}
          >
            Delete Dataset Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : (
    button
  );
};
