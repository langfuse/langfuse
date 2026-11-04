import { type ComponentProps } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SessionManageViewsDialog } from "./SessionManageViewsDialog";

export function ConnectedSessionManageViewsDialog({
  projectId,
  ...props
}: Pick<
  ComponentProps<typeof SessionManageViewsDialog>,
  | "unpinnedViewIds"
  | "viewOrder"
  | "onReorder"
  | "onPin"
  | "onUnpin"
  | "onEditView"
  | "onDeleteView"
> & {
  projectId: string;
}) {
  const session = useSession();
  const views = api.sessionViews.list.useQuery({
    projectId,
  });
  const canEdit = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  return (
    <SessionManageViewsDialog
      {...props}
      views={views.data ?? []}
      currentUserId={session.data?.user?.id}
      canEdit={canEdit}
      isLoading={views.isLoading}
      error={views.error?.message}
    />
  );
}
