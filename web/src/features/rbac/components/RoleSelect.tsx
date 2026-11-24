import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowUpRight } from "@langfuse/icons";
import { projectNoneRoleComment, type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import { orgNoneRoleComment } from "@langfuse/shared/rbac";

import {
  Select,
  SelectContent,
  SelectTrigger,
} from "@/src/components/ui/select";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";

/** The ghost trigger's unseen border and the space after its role name; read-only roles reuse it to end at the same edge. */
export const roleTrailingSpacing = "gap-1 border border-transparent pr-1.5";

const triggerVariants = cva("", {
  variants: {
    size: {
      default: "",
      compact: "w-30",
    },
    variant: {
      name: "",
      detailed: "h-auto",
    },
    appearance: {
      field: "",
      /** No box until hovered, for a role that reads as text in a row. The arrow sits a pixel lower to look centred on the text. */
      ghost: `hover:bg-muted data-[state=open]:bg-muted w-auto bg-transparent pl-2 [&>svg]:translate-y-px ${roleTrailingSpacing}`,
    },
  },
  defaultVariants: {
    size: "default",
    variant: "name",
    appearance: "field",
  },
});

const menuVariants = cva("", {
  variants: {
    menu: {
      auto: "",
      /** As wide as the trigger. */
      trigger: "w-(--radix-select-trigger-width)",
      /** Wider than a narrow trigger, opening toward the start. */
      wide: "w-80",
    },
  },
  defaultVariants: {
    menu: "auto",
  },
});

/** RoleSelect offers permission previews for each role; the owner role is only selectable with `canManageOwnership`. */
export function RoleSelect<TRole extends SystemRole = Role>({
  roles,
  value,
  onValueChange,
  isProjectRole = false,
  canManageOwnership = true,
  disabled = false,
  triggerId,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  size,
  variant = "name",
  appearance,
  menu,
  display,
  valueLabel,
  optionDisabledReason,
  autoFocus,
  onOpenChange,
}: {
  roles: TRole[];
  value: TRole;
  onValueChange: (role: TRole) => void;
  isProjectRole?: boolean;
  canManageOwnership?: boolean;
  disabled?: boolean;
  triggerId?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** `detailed` shows the role's description in the trigger and a permissions link under it. */
  variant?: "name" | "detailed";
  /** display overrides how roles are presented, in the trigger, the options and the permission preview. */
  display?: (role: SystemRole) => RoleDisplay;
  /** valueLabel replaces the selected role's name in the trigger. */
  valueLabel?: string;
  /** A reason makes the option unselectable and replaces its description. */
  optionDisabledReason?: (role: TRole) => string | undefined;
  autoFocus?: boolean;
  /** Called when the options open or close. */
  onOpenChange?: (open: boolean) => void;
} & Pick<VariantProps<typeof triggerVariants>, "size" | "appearance"> &
  VariantProps<typeof menuVariants>) {
  const [open, setOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<SystemRole | null>(
    null,
  );

  const openPermissions = (role: SystemRole) => {
    setOpen(false);
    setPermissionsRole(role);
    setPermissionsOpen(true);
  };

  const shown = (display ?? roleDisplay)(value);
  // A custom display names the roles itself, so it gets no default-role note.
  const keepDefaultNote = !display && value === "NONE" && isProjectRole;
  const label =
    valueLabel ??
    `${shown.name}${keepDefaultNote ? " (keep default role)" : ""}`;

  return (
    <>
      <Select
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
        value={value}
        onValueChange={(role) => onValueChange(role as TRole)}
        disabled={disabled}
      >
        <SelectTrigger
          id={triggerId}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={triggerVariants({ size, variant, appearance })}
          disableValueLineClamp
          autoFocus={autoFocus}
        >
          {variant === "detailed" ? (
            <div className="flex flex-col text-left">
              <span className="font-bold">{label}</span>
              <span className="text-muted-foreground text-xs">
                {shown.description}
              </span>
            </div>
          ) : (
            <span className="truncate" title={label}>
              {label}
            </span>
          )}
        </SelectTrigger>
        <SelectContent
          align={menu === "wide" ? "end" : undefined}
          className={menuVariants({ menu })}
        >
          {roles.map((role) => (
            <RoleSelectItem
              key={role}
              role={role}
              display={display}
              isProjectRole={display ? undefined : isProjectRole}
              disabledReason={
                optionDisabledReason?.(role) ??
                (role === "OWNER" && !canManageOwnership
                  ? "requires owner access"
                  : undefined)
              }
              onViewPermissions={openPermissions}
            />
          ))}
        </SelectContent>
      </Select>
      {variant === "detailed" && (
        <button
          type="button"
          onClick={() => {
            setPermissionsRole(value);
            setPermissionsOpen(true);
          }}
          className="text-muted-foreground hover:text-foreground ml-1 w-fit text-xs"
        >
          View{" "}
          <span className="inline-flex items-center gap-0.5 underline">
            {rolePermissionCountLabel(value)}
            <ArrowUpRight size="sm" />
          </span>
        </button>
      )}
      <RolePermissionPopup
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        roles={permissionsRole ? [permissionsRole] : []}
        display={display}
        emptyStateComment={
          isProjectRole ? projectNoneRoleComment : orgNoneRoleComment
        }
      />
    </>
  );
}
