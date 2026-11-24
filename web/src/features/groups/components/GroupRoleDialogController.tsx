import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  GroupRoleDialog,
  type GroupRoleDialogProps,
} from "@/src/features/groups/components/GroupRoleDialog";

/** Opens the group role dialog from whatever `children` renders. */
export function GroupRoleDialogController({
  children,
  ...props
}: GroupRoleDialogProps & {
  children: (openDialog: () => void) => React.ReactNode;
}) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <GroupRoleDialog {...props} onDone={closeDialog} />
      )}
    >
      {({ openDialog }) => children(() => openDialog())}
    </DialogController>
  );
}
