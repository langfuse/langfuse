import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Badge } from "@/src/components/ui/badge";
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
  emptyStateComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: SystemRole | null;
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
                <Icon className="h-4 w-4 shrink-0" />
                <span>{def.name}</span>
                <Badge
                  variant="tertiary"
                  className="ml-1 shrink-0 text-[0.7rem] tabular-nums"
                >
                  <span className="font-bold">{rolePermissionCount(role)}</span>{" "}
                  {rolePermissionNoun(role)}
                </Badge>
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
