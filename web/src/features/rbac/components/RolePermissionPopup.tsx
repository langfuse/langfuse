/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  RolePermissionList,
  rolePermissionCount,
  rolePermissionNoun,
} from "@/src/features/rbac/components/RolePermissionList";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

/** RolePermissionPopup must remain outside the Select content. */
export function RolePermissionPopup({
  open,
  onOpenChange,
  role,
  transformName = (name) => name,
  emptyStateComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: SystemRole | null;
  /** transformName rewrites the role name before it is shown. */
  transformName?: (name: string) => string;
  emptyStateComment?: string;
}) {
  const def = role ? systemRoleAccessRights[role] : undefined;
  const Icon = role ? roleIcons[role] : undefined;
  const showEmptyStateComment =
    role !== null &&
    emptyStateComment !== undefined &&
    rolePermissionCount(role) === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeOnInteractionOutside
        className="min-h-[25.5rem] min-w-[32rem]"
      >
        {role && def && Icon && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon size="base" />
                <span>{transformName(def.name)}</span>
                <span className="ml-1 shrink-0 tabular-nums">
                  <BadgeShell color="filled" size="sm">
                    <span className="font-bold">
                      {rolePermissionCount(role)}
                    </span>{" "}
                    {rolePermissionNoun(role)}
                  </BadgeShell>
                </span>
              </DialogTitle>
            </DialogHeader>
            <DialogBody className={showEmptyStateComment ? undefined : "p-0"}>
              {showEmptyStateComment ? (
                <p className="text-muted-foreground text-sm">
                  {emptyStateComment}
                </p>
              ) : (
                <RolePermissionList role={role} />
              )}
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
