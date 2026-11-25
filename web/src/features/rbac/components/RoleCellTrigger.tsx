import { Users } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { selectTriggerClassName } from "@/src/components/ui/select";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { cn } from "@/src/utils/tailwind";

export function RoleCellTrigger({
  roles,
  label,
  groupHint,
  onClick,
}: {
  roles: Role[];
  label: string;
  groupHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // The label and hint name the member's groups.
      className={cn(
        selectTriggerClassName,
        "ph-no-capture hover:bg-muted w-auto max-w-full min-w-0",
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
              {roleName(role)}
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
