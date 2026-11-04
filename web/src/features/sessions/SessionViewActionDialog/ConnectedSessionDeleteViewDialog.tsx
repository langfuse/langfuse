import { api, type RouterOutputs } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SessionDeleteViewDialog } from "./SessionDeleteViewDialog";

export function ConnectedSessionDeleteViewDialog({
  projectId,
  view,
  onDeleted,
  onClose,
}: {
  projectId: string;
  view: Pick<
    RouterOutputs["sessionViews"]["list"][number],
    "id" | "name" | "canEdit"
  >;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const utils = api.useUtils();
  const deleteView = api.sessionViews.delete.useMutation();
  const canEdit = hasWriteAccess && view.canEdit;
  return (
    <SessionDeleteViewDialog
      view={view}
      canEdit={canEdit}
      isPending={deleteView.isPending}
      error={deleteView.error?.message}
      onDelete={async () => {
        if (!canEdit || deleteView.isPending || view.id === "messages") return;
        try {
          await deleteView.mutateAsync({ projectId, id: view.id });
          onDeleted(view.id);
          await utils.sessionViews.list.invalidate({ projectId });
          onClose();
        } catch {
          // Keep mutation errors visible so deletion can be retried.
        }
      }}
    />
  );
}
