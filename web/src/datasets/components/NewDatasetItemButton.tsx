import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/app/design-system/legacy-primitives/dialog";
import { useRef, useState } from "react";
import { NewDatasetItemForm } from "@/src/datasets/components/NewDatasetItemForm";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { ActionButton } from "@/src/app/components/ActionButton";

export const NewDatasetItemButton = (props: {
  projectId: string;
  datasetId?: string;
}) => {
  const [open, setOpen] = useState(false);
  const submissionPending = useRef(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  return (
    <Dialog
      open={hasAccess && open}
      onOpenChange={(next) => {
        if (!submissionPending.current) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <ActionButton
          variant="outline"
          hasAccess={hasAccess}
          trackingEventName="dataset_item:new_form_open"
          icon={<PlusIcon className="icon-base" aria-hidden="true" />}
        >
          New item
        </ActionButton>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Create new dataset item</DialogTitle>
        </DialogHeader>
        <NewDatasetItemForm
          projectId={props.projectId}
          datasetId={props.datasetId}
          onPendingChange={(pending) => {
            submissionPending.current = pending;
          }}
          onFormSuccess={() => setOpen(false)}
          className="h-full overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
};
