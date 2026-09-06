import { Dialog } from "@/src/components/ui/dialog";
import {
  UpdateDatasetDialogContent,
  type UpdateDatasetDialogProps,
} from "@/src/features/datasets/components/UpdateDatasetDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("coreDetails.datasets.misc");
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const disabled = hasAccess ? undefined : { reason: t("permissionEdit") };

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
