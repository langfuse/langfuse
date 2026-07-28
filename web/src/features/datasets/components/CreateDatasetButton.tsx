import { Button, type ButtonProps } from "@/src/components/ui/button";
import { Dialog, DialogTrigger } from "@/src/components/ui/dialog";
import { CreateDatasetDialogContent } from "@/src/features/datasets/components/CreateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { LockIcon, PlusIcon } from "lucide-react";
import { forwardRef, useState } from "react";

interface CreateDatasetButtonProps {
  projectId: string;
  folderPrefix?: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const CreateDatasetButton = forwardRef<
  HTMLButtonElement,
  CreateDatasetButtonProps
>(({ projectId, folderPrefix, className, size, variant }, ref) => {
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
          className={className}
          disabled={!hasAccess}
          onClick={() => capture("datasets:new_form_open")}
          variant={variant || "default"}
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
        folderPrefix={folderPrefix}
        onFormSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
});

CreateDatasetButton.displayName = "CreateDatasetButton";
