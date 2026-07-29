import {
  DeleteDatasetDialog,
  type DeleteDatasetDialogDataProps,
} from "@/src/features/datasets/components/DeleteDatasetDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ReactNode, useState } from "react";

export type DeleteDatasetDialogSource = "dataset" | "table-single-row";

export function DeleteDatasetDialogController({
  children,
  source,
  ...props
}: DeleteDatasetDialogDataProps & {
  source: DeleteDatasetDialogSource;
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
    : { reason: "You don't have permission to delete this dataset." };

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
    capture("datasets:delete_form_open", { source });
  };

  return (
    <>
      {children({ disabled, openDialog })}
      <DeleteDatasetDialog
        {...props}
        open={hasAccess && open}
        onOpenChange={setOpen}
      />
    </>
  );
}
