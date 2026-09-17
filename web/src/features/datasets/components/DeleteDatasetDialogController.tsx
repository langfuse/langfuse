import { useHasProjectAccess } from "@/src/features/rbac";
import {
  DeleteDatasetDialog,
  type DeleteDatasetDialogDataProps,
} from "./DeleteDatasetDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type ReactNode } from "react";

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
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to delete this dataset." };

  return (
    <DeleteDatasetDialog {...props}>
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            if (!hasAccess) return;

            openDialog();
            capture("datasets:delete_form_open", { source });
          },
        })
      }
    </DeleteDatasetDialog>
  );
}
