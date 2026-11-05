import { api, type RouterOutputs } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SessionDuplicateViewDialog } from "./SessionDuplicateViewDialog";

export function ConnectedSessionDuplicateViewDialog({
  projectId,
  view,
  onSaved,
  onClose,
}: {
  projectId: string;
  view: Pick<
    RouterOutputs["sessionViews"]["list"][number],
    "id" | "name" | "filters" | "viewMode" | "unmatchedTraces"
  >;
  onSaved: (view: RouterOutputs["sessionViews"]["create"]["view"]) => void;
  onClose: () => void;
}) {
  const canEdit = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const utils = api.useUtils();
  const createView = api.sessionViews.create.useMutation();
  return (
    <SessionDuplicateViewDialog
      view={view}
      canEdit={canEdit}
      isPending={createView.isPending}
      error={createView.error?.message}
      onSubmit={async (name) => {
        if (!canEdit || createView.isPending || !name.trim()) return;
        try {
          const result = await createView.mutateAsync({
            projectId,
            name: name.trim(),
            filters: view.filters,
            viewMode: view.viewMode,
            unmatchedTraces: view.unmatchedTraces,
          });
          onSaved(result.view);
          await utils.sessionViews.list.invalidate({ projectId });
          await utils.sessionViews.preferences.invalidate({ projectId });
          onClose();
        } catch {
          // Keep mutation errors visible so duplication can be retried.
        }
      }}
    />
  );
}
