import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Button } from "@/src/components/design-system/Button/Button";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { RoleWithIcon } from "@/src/features/rbac/components/RoleWithIcon";

export function EffectiveRoleCard({
  caption,
  roles,
  onViewPermissions,
}: {
  caption: string;
  roles: Role[];
  onViewPermissions?: (role: Role) => void;
}) {
  return (
    <div className="flex flex-col rounded-md border">
      <div className="bg-muted text-muted-foreground rounded-t-md border-b px-3 py-2 text-xs">
        Effective role · {caption}
      </div>
      <ul className="flex flex-col divide-y">
        {roles.map((role) => (
          <li
            key={role}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_6.5rem] items-baseline gap-3 px-3 py-2"
          >
            <span className="font-bold">
              <RoleWithIcon role={role} />
            </span>
            <span className="text-muted-foreground">
              {systemRoleAccessRights[role].description}
            </span>
            <span className="text-muted-foreground text-right text-xs">
              {role !== "NONE" &&
                (onViewPermissions ? (
                  <Button
                    variant="text"
                    size="sm"
                    text={rolePermissionCountLabel(role)}
                    onClick={() => onViewPermissions(role)}
                  />
                ) : (
                  rolePermissionCountLabel(role)
                ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
