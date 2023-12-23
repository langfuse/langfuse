import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { LockIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

export const NewAlertButton = (props: {
  projectId: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  // TODO: create scope and check access using useHasAccess
  const hasAccess = true;

  return (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className={props.className}
          disabled={!hasAccess}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
          {hasAccess ? (
            <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          ) : (
            <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
          )}
          New Alert
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Create new Alert</DialogTitle>
        </DialogHeader>
        {/* TODO: Form for creating new alert 
        * <NewDatasetForm
          projectId={props.projectId}
          onFormSuccess={() => setOpen(false)}
        /> */}
      </DialogContent>
    </Dialog>
  );
};
