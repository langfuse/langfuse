import { useState } from "react";
import { type SystemRole } from "@langfuse/shared/src/db";

import { Button } from "@/src/components/design-system/Button/Button";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";

export function RolePermissionsLink({ role }: { role: SystemRole }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        variant="text"
        size="sm"
        text={`View ${rolePermissionCountLabel(role)}`}
        onClick={() => setIsOpen(true)}
      />
      <RolePermissionPopup open={isOpen} onOpenChange={setIsOpen} role={role} />
    </>
  );
}
