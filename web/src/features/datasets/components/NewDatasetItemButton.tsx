import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { ActionButton } from "@/src/components/ActionButton";

export const NewDatasetItemButton = (props: {
  projectId: string;
  datasetId?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();
  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionButton
          variant="outline"
          className={props.className}
          hasAccess={hasAccess}
          onClick={() => capture("dataset_item:new_form_open")}
          icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
        >
          New item
        </ActionButton>
      </DialogTrigger>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Create new dataset item</DialogTitle>
        </DialogHeader>
        <NewDatasetItemForm
          projectId={props.projectId}
          datasetId={props.datasetId}
          onFormSuccess={() => setOpen(false)}
          className="h-full overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
};
