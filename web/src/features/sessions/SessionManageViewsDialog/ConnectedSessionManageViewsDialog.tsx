import { type ComponentProps } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SessionManageViewsDialog } from "./SessionManageViewsDialog";

export function ConnectedSessionManageViewsDialog({
  projectId,
  error,
  ...props
}: Pick<
  ComponentProps<typeof SessionManageViewsDialog>,
  | "pinnedViewIds"
  | "onReorder"
  | "onPin"
  | "onUnpin"
  | "onEditView"
  | "onDeleteView"
  | "onSetDefaultPin"
  | "error"
> & {
  projectId: string;
}) {
  const views = api.sessionViews.list.useQuery({
    projectId,
  });
  const canEditPrivateViews = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const canEditProjectViews = useHasProjectAccess({
    projectId,
    scope: "SessionViews:CUD",
  });
  return (
    <SessionManageViewsDialog
      {...props}
      views={views.data ?? []}
      canEdit={canEditPrivateViews || canEditProjectViews}
      isLoading={views.isLoading}
      error={error ?? views.error?.message}
    />
  );
}
