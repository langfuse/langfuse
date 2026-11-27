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
  rolePermissionCount,
  rolePermissionNoun,
} from "@/src/features/rbac/components/RolePermissionList";
import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";

/** RolePermissionPopup must remain outside the Select content. */
export function RolePermissionPopup({
  open,
  onOpenChange,
  role,
  display = roleDisplay,
  emptyStateComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: SystemRole | null;
  /** display overrides how the role is presented. */
  display?: (role: SystemRole) => RoleDisplay;
  emptyStateComment?: string;
}) {
  const shown = role ? display(role) : undefined;
  const Icon = shown?.Icon;
  const showEmptyStateComment =
    role !== null &&
    emptyStateComment !== undefined &&
    rolePermissionCount(role) === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeOnInteractionOutside
        className="min-h-[25.5rem] sm:min-w-[32rem]"
      >
        {role && shown && Icon && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon size="base" />
                <span>{shown?.name}</span>
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
