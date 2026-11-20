import { SquareArrowOutUpRight } from "@langfuse/icons";
import { type SystemRole } from "@langfuse/shared/src/db";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { SelectItem } from "@/src/components/ui/select";
import {
  rolePermissionCountLabel,
  type ResourceKind,
} from "@/src/features/rbac/components/RolePermissionList";
import { cn } from "@/src/utils/tailwind";
import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";

/** viewPermissionsButtonPlacements sizes the button beside the label or at the row's end. */
const viewPermissionsButtonPlacements = {
  inline: "h-5 gap-1 pr-1 pl-2 text-xs whitespace-nowrap tabular-nums",
  trailing: "ml-auto h-6 w-6 justify-center self-center",
};

/** RoleSelectItem adds a permission preview to a role option. */
export const RoleSelectItem = ({
  role,
  display = roleDisplay,
  isProjectRole,
  disabledReason,
  showPermissionCount,
  resourceKinds,
  onViewPermissions,
}: {
  role: SystemRole;
  /** display overrides how the role is presented. */
  display?: (role: SystemRole) => RoleDisplay;
  isProjectRole?: boolean;
  /** disabledReason makes the option unselectable and explains why. */
  disabledReason?: string;
  /** showPermissionCount moves the view-permissions button beside the label and adds the permission count. */
  showPermissionCount?: boolean;
  /** resourceKinds limits the permission count to the kinds that apply. */
  resourceKinds?: ResourceKind[];
  onViewPermissions: (role: SystemRole) => void;
}) => {
  const { name: label, description, Icon } = display(role);
  const keepDefaultNote = role === "NONE" && isProjectRole;

  return (
    <SelectItem
      value={role}
      disabled={disabledReason !== undefined}
      className="group pl-2 [&>span:not([data-checkmark])]:flex-1 [&>span[data-checkmark]]:hidden"
    >
      <div className="flex w-full items-start gap-2 text-left">
        <Icon size="base" __rawClassName="mt-1" />
        <div className="flex flex-col">
          <span className="flex items-center gap-1">
            <span className="font-bold">
              {label}
              {keepDefaultNote ? " (keep default role)" : ""}
            </span>
            {showPermissionCount && (
              <ViewPermissionsButton
                label={label}
                countLabel={rolePermissionCountLabel(role, resourceKinds)}
                onClick={() => onViewPermissions(role)}
                placement="inline"
              />
            )}
          </span>
          <span className="text-muted-foreground text-xs">{description}</span>
          {disabledReason !== undefined && (
            <span className="text-muted-foreground text-xs italic">
              {disabledReason}
            </span>
          )}
        </div>
        {!showPermissionCount && (
          <ViewPermissionsButton
            label={label}
            onClick={() => onViewPermissions(role)}
            placement="trailing"
          />
        )}
      </div>
    </SelectItem>
  );
};

/** ViewPermissionsButton opens a role's permissions, shown while its option is hovered. */
function ViewPermissionsButton({
  label,
  countLabel,
  onClick,
  placement,
}: {
  label: string;
  countLabel?: string;
  onClick: () => void;
  placement: keyof typeof viewPermissionsButtonPlacements;
}) {
  return (
    <Tooltip label="View permissions" hoverableContent={false} delay={0}>
      {({ getTriggerProps }) => (
        <button
          type="button"
          {...getTriggerProps()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }}
          aria-label={`View ${label} permissions`}
          className={cn(
            "text-muted-foreground hover:bg-background hover:text-foreground pointer-events-auto flex shrink-0 items-center rounded-full opacity-0 group-hover:opacity-100 group-data-disabled:opacity-100 group-data-highlighted:opacity-100 focus-visible:opacity-100",
            viewPermissionsButtonPlacements[placement],
          )}
        >
          {countLabel}
          <SquareArrowOutUpRight size="base" />
        </button>
      )}
    </Tooltip>
  );
}
