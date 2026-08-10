import { Dialog } from "@/src/components/ui/dialog";
import {
  CreateDatasetDialogContent,
  type CreateDatasetDialogProps,
} from "@/src/features/datasets/components/CreateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ReactNode, useState } from "react";

export function CreateDatasetDialogController({
  children,
  ...props
}: CreateDatasetDialogProps & {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to create a dataset." };

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
    capture("datasets:new_form_open");
  };

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
      <CreateDatasetDialogContent
        {...props}
        onFormSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
}
