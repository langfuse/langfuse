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
  const defaultPin = api.sessionViews.setDefaultPin.useMutation({
    onSuccess: async () => {
      await utils.sessionViews.list.invalidate({ projectId });
      await utils.sessionViews.preferences.invalidate({ projectId });
    },
  });
  const canSetDefaultPin = useHasProjectAccess({
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
      onSetDefaultPin={
        canSetDefaultPin
          ? (id, isPinnedByDefaultForProject) =>
              defaultPin.mutate({ projectId, id, isPinnedByDefaultForProject })
          : undefined
      }
      isLoading={views.isLoading}
      error={defaultPin.error?.message ?? views.error?.message}
    />
  );
}
