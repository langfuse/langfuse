import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GroupDialog } from "@/src/features/groups/components/GroupDialog";
import { useGroupDialogParam } from "@/src/features/groups/groupDialogLink";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** Shows the dialog of the group in `?group=<id>` over the current page. */
export function GroupDialogHost({ orgId }: { orgId: string }) {
  const [groupId, setGroupId] = useGroupDialogParam();
  const canEdit = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "groups:CUD",
  });
  const close = () => setGroupId(undefined);
  return (
    // Remounts per group, so a new `?group=` opens that group's dialog.
    <DialogController<string>
      key={groupId ?? "none"}
      initialState={() => groupId}
      onDismiss={close}
      renderDialog={({ state, closeDialog }) => (
        <GroupDialog
          orgId={orgId}
          groupId={state}
          canEdit={canEdit}
          onDone={() => {
            closeDialog();
            close();
          }}
        />
      )}
    >
      {() => null}
    </DialogController>
  );
}
