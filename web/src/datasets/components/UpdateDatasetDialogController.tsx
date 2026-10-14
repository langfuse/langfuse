import { useHasProjectAccess } from "@/src/identity/access-control";
import { Dialog } from "@/src/app/design-system/legacy-primitives/dialog";
import {
  UpdateDatasetDialogContent,
  type UpdateDatasetDialogProps,
} from "@/src/datasets/components/UpdateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { type ReactNode, useState } from "react";

export type UpdateDatasetDialogSource = "dataset" | "table-single-row";

export function UpdateDatasetDialogController({
  children,
  source,
  ...props
}: UpdateDatasetDialogProps & {
  source: UpdateDatasetDialogSource;
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
    : { reason: "You don't have permission to edit this dataset." };

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
    capture("datasets:update_form_open", {
      source,
    });
  };

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
      <UpdateDatasetDialogContent
        {...props}
        onFormSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
}
