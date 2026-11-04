import { useState } from "react";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ConnectedSessionCustomizationDialog } from "@/src/features/sessions/SessionCustomizationDialog/ConnectedSessionCustomizationDialog";

export function ConnectedSessionEditViewDialog({
  projectId,
  sessionId,
  isOpen,
  view,
  onSaved,
  onClose,
}: {
  projectId: string;
  sessionId: string;
  isOpen: boolean;
  view: Pick<
    RouterOutputs["sessionViews"]["list"][number],
    "id" | "name" | "filters" | "viewMode" | "unmatchedTraces" | "canEdit"
  >;
  onSaved: (view: RouterOutputs["sessionViews"]["update"]["view"]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(view.name);
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const canEdit = hasWriteAccess && view.canEdit;
  const utils = api.useUtils();
  const updateView = api.sessionViews.update.useMutation();
  return (
    <ConnectedSessionCustomizationDialog
      projectId={projectId}
      sessionId={sessionId}
      isOpen={isOpen}
      initialFilters={view.filters}
      initialUnmatchedTraces={view.unmatchedTraces}
      initialViewMode={view.viewMode}
      editing={{
        name,
        onNameChange: setName,
        pending: updateView.isPending,
        disabled: !canEdit,
        error: updateView.error?.message,
      }}
      onApply={async (filters, unmatchedTraces, viewMode) => {
        if (!canEdit || updateView.isPending || !name.trim()) return;
        try {
          const result = await updateView.mutateAsync({
            projectId,
            id: view.id,
            name: name.trim(),
            filters,
            viewMode,
            unmatchedTraces,
          });
          onSaved(result.view);
          await utils.sessionViews.list.invalidate({ projectId });
          onClose();
        } catch {
          // Keep mutation errors visible so saving can be retried.
        }
      }}
    />
  );
}
