import { useState } from "react";
import { type SystemRole } from "@langfuse/shared/src/db";

import {
  combinedPermissionCount,
  permissionCountLabel,
} from "@/src/features/rbac/components/RolePermissionList";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";

/** A link that counts the permissions the roles give together and opens their list. */
export function RolePermissionsLink({
  roles,
  isCombined = false,
}: {
  roles: SystemRole[];
  /** Says the count adds up several sources. */
  isCombined?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-link hover:text-link-hover focus-visible:ring-ring rounded-sm text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:outline-hidden"
      >
        View {permissionCountLabel(combinedPermissionCount(roles))}
        {isCombined ? " combined" : ""}
      </button>
      <RolePermissionPopup
        open={isOpen}
        onOpenChange={setIsOpen}
        roles={roles}
      />
    </>
  );
}
