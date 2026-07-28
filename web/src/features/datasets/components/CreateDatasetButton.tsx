import { Button } from "@/src/components/ui/button";
import { Dialog, DialogTrigger } from "@/src/components/ui/dialog";
import {
  CreateDatasetDialogContent,
  type CreateDatasetTarget,
} from "@/src/features/datasets/components/CreateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { LockIcon, PlusIcon } from "lucide-react";
import { forwardRef, useState } from "react";

interface CreateDatasetButtonProps {
  projectId: string;
  target: CreateDatasetTarget;
  size: "default" | "lg";
}

export const CreateDatasetButton = forwardRef<
  HTMLButtonElement,
  CreateDatasetButtonProps
>(({ projectId, target, size }, ref) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          ref={ref}
          size={size}
          disabled={!hasAccess}
          onClick={() => capture("datasets:new_form_open")}
          variant="default"
        >
          {hasAccess ? (
            <PlusIcon className="mr-1.5 -ml-0.5 h-4 w-4" aria-hidden="true" />
          ) : (
            <LockIcon className="mr-1.5 -ml-0.5 h-3 w-3" aria-hidden="true" />
          )}
          New dataset
        </Button>
      </DialogTrigger>
      <CreateDatasetDialogContent
        projectId={projectId}
        target={target}
        onFormSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
});

CreateDatasetButton.displayName = "CreateDatasetButton";
