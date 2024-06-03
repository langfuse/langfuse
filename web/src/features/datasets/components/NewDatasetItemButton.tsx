import { Button } from "@/src/components/ui/button";
import { LockIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const NewDatasetItemButton = (props: {
  projectId: string;
  datasetId?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });
  const capture = usePostHogClientCapture();
  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className={props.className}
          disabled={!hasAccess}
          onClick={() => capture("dataset_item:new_form_open")}
        >
          {hasAccess ? (
            <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          ) : (
            <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
          )}
          New item
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none items-start">
        <DialogHeader>Create new dataset item</DialogHeader>
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
