import { useHasProjectAccess } from "@/src/identity/access-control";
import { Dialog } from "@/src/app/design-system/legacy-primitives/dialog";
import {
  CreateDatasetDialogContent,
  type CreateDatasetDialogProps,
} from "@/src/datasets/components/CreateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
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
