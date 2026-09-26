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

/**
 * RolePermissionPopup is the modal, sibling-rendered role definition dialog
 * shared by the api-key create dialog and the members/invites role dropdowns.
 * Render it as a sibling of the Select that opens it (never inside
 * SelectContent), since Radix unmounts the Select content on close.
 * `emptyStateComment` overrides the permission list for roles that grant
 * nothing (e.g. NONE), where a plain empty list would be unhelpful.
 */
export function RolePermissionPopup({
  role,
  onClose,
  emptyStateComment,
}: {
  role: SystemRole | null;
  onClose: () => void;
  emptyStateComment?: string;
}) {
  const def = role ? systemRoleAccessRights[role] : undefined;
  const Icon = role ? roleIcons[role] : undefined;
  const showEmptyStateComment =
    role !== null &&
    emptyStateComment !== undefined &&
    rolePermissionCount(role) === 0;

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
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
