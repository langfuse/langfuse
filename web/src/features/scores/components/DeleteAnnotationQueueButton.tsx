import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { Trash } from "lucide-react";
import React, { useState } from "react";

type DeleteAnnotationQueueButtonProps = {
  projectId: string;
  queueId: string;
};

export const DeleteAnnotationQueueButton = ({
  projectId,
  queueId,
}: DeleteAnnotationQueueButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "scoreConfigs:CUD",
  });
  const utils = api.useUtils();
  const mutDelete = api.annotationQueues.delete.useMutation({
    onSuccess: () => {
      utils.annotationQueues.invalidate();
    },
  });

  const button = (
    <Button variant="ghost" className="w-full" disabled={!hasAccess}>
      <div className="flex w-full flex-row items-center gap-1">
        <Trash className="h-4 w-4" />
        <span className="text-sm font-normal">Delete</span>
      </div>
    </Button>
  );

  return hasAccess ? (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!mutDelete.isLoading) {
          setIsOpen(open);
        }
      }}
    >
      <DialogTrigger asChild>{button}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="mb-4">Please confirm</DialogTitle>
          <DialogDescription className="text-md p-0">
            This action cannot be undone and removes queue items attached to
            this queue. Scores added while annotating in this queue will not be
            deleted.
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="destructive"
          loading={mutDelete.isLoading}
          disabled={mutDelete.isLoading}
          onClick={async (event) => {
            event.preventDefault();
            await mutDelete.mutateAsync({
              projectId,
              queueId,
            });
            setIsOpen(false);
          }}
        >
          Delete Annotation Queue
        </Button>
      </DialogContent>
    </Dialog>
  ) : (
    button
  );
};
