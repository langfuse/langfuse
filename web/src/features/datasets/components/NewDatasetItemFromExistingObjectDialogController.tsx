import { type ReactNode, useState } from "react";

import { Dialog } from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  NewDatasetItemFromExistingObjectDialogContent,
  type NewDatasetItemFromExistingObjectDialogContentProps,
} from "./NewDatasetItemFromExistingObjectDialogContent";

type NewDatasetItemFromExistingObjectDialogControllerProps = Omit<
  NewDatasetItemFromExistingObjectDialogContentProps,
  "onFormSuccess"
> & {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
  onOpen?: () => void;
};

export const NewDatasetItemFromExistingObjectDialogController = ({
  children,
  onOpen,
  ...props
}: NewDatasetItemFromExistingObjectDialogControllerProps) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
    onOpen?.();
  };

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to create a dataset." };

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {children({ disabled, openDialog })}
      <NewDatasetItemFromExistingObjectDialogContent
        {...props}
        onFormSuccess={() => setOpen(false)}
      />
    </Dialog>
  );
};
