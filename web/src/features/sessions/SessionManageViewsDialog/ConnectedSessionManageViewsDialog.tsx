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
  | "pinnedViewIds"
  | "onReorder"
  | "onPin"
  | "onUnpin"
  | "onEditView"
  | "onDeleteView"
> & {
  projectId: string;
}) {
  const session = useSession();
  const utils = api.useUtils();
  const pinForEveryone = api.sessionViews.pinForEveryone.useMutation({
    onSuccess: () => utils.sessionViews.preferences.invalidate({ projectId }),
  });
  const canPinForEveryone = useHasProjectAccess({
    projectId,
    scope: "projectMembers:CUD",
  });
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
      onPinForEveryone={
        canPinForEveryone
          ? (id) => pinForEveryone.mutate({ projectId, id })
          : undefined
      }
      isLoading={views.isLoading}
      error={pinForEveryone.error?.message ?? views.error?.message}
    />
  );
}
