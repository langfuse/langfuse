import { Users } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { selectTriggerClassName } from "@/src/components/ui/select";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { cn } from "@/src/utils/tailwind";

/**
 * A role table cell that looks like the role select: each effective role with
 * its icon, and a dropdown arrow. `groupHint` adds a group icon with that text on hover, for a
 * role a group sets. Clicking it opens the role dialog.
 */
export function RoleCellTrigger({
  roles,
  label,
  groupHint,
  onClick,
}: {
  roles: Role[];
  /** Accessible name, e.g. "Admin, from Platform Admins. Open role details". */
  label: string;
  groupHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        selectTriggerClassName,
        "hover:bg-muted w-auto max-w-full min-w-0",
      )}
      aria-label={label}
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        {roles.map((role, index) => {
          const Icon = roleIcons[role];
          return (
            <span key={role} className="flex shrink-0 items-center gap-2">
              {index > 0 && (
                <span className="text-muted-foreground" aria-hidden="true">
                  +
                </span>
              )}
              <Icon size="base" aria-hidden="true" />
              {systemRoleAccessRights[role].name}
            </span>
          );
        })}
      </span>
      {groupHint && (
        <span className="text-muted-foreground inline-flex" title={groupHint}>
          <Users size="sm" aria-hidden="true" />
        </span>
      )}
      <DropdownIndicator />
    </button>
  );
}
