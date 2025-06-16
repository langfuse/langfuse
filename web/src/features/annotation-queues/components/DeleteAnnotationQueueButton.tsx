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
import { api } from "@/src/utils/api";
import { LockIcon, Trash } from "lucide-react";
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
    scope: "annotationQueues:CUD",
  });
  const utils = api.useUtils();
  const mutDelete = api.annotationQueues.delete.useMutation({
    onSuccess: () => {
      utils.annotationQueues.invalidate();
    },
  });

  const button = (
    <Button variant="ghost" disabled={!hasAccess}>
      <div className="flex w-full flex-row items-center gap-1">
        {hasAccess ? (
          <Trash className="-ml-0.5 mr-1.5 h-4 w-4" />
        ) : (
          <LockIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
        )}
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
      <DialogContent className="overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="mb-4">Please confirm</DialogTitle>
          <DialogDescription className="text-md p-0">
            This action cannot be undone and removes queue items attached to
            this queue. Scores added while annotating in this queue will not be
            deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : (
    button
  );
};
