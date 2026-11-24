/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { type SystemRole } from "@langfuse/shared/src/db";

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
  combinedPermissionCount,
  permissionNoun,
} from "@/src/features/rbac/components/RolePermissionList";
import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";

/** RolePermissionPopup must remain outside the Select content. Several roles show their permissions combined. */
export function RolePermissionPopup({
  open,
  onOpenChange,
  roles,
  display = roleDisplay,
  emptyStateComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: SystemRole[];
  /** display overrides how a role is presented. */
  display?: (role: SystemRole) => RoleDisplay;
  emptyStateComment?: string;
}) {
  const count = combinedPermissionCount(roles);
  const showEmptyStateComment = emptyStateComment !== undefined && count === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeOnInteractionOutside
        className="min-h-[25.5rem] sm:min-w-[32rem]"
      >
        {roles.length > 0 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>
                  {roles.map((role) => display(role).name).join(" + ")}
                </span>
                <span className="ml-1 shrink-0 tabular-nums">
                  <BadgeShell color="filled" size="sm">
                    <span className="font-bold">{count}</span>{" "}
                    {permissionNoun(count)}
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
                <RolePermissionList roles={roles} />
              )}
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
