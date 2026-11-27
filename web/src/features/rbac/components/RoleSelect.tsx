import { useRef, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { projectNoneRoleComment, type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import {
  orgNoneRoleComment,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import {
  Select,
  SelectContent,
  SelectTrigger,
} from "@/src/components/ui/select";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

const triggerVariants = cva("", {
  variants: {
    size: {
      default: "",
      compact: "w-30",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

/** RoleSelect offers permission previews for each role; the owner role is only selectable with `canManageOwnership`. */
export function RoleSelect({
  roles,
  value,
  onValueChange,
  isProjectRole = false,
  canManageOwnership,
  disabled = false,
  triggerId,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  size,
  onAfterPick,
}: {
  roles: Role[];
  value: Role;
  onValueChange: (role: Role) => void;
  isProjectRole?: boolean;
  canManageOwnership: boolean;
  disabled?: boolean;
  triggerId?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** Called once the list closed on a pick, in place of focusing the trigger again. */
  onAfterPick?: () => void;
} & VariantProps<typeof triggerVariants>) {
  const [open, setOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<SystemRole | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  // The list closes on a pick, but also on Escape, an outside click or a permission preview.
  const isDismissedRef = useRef(false);

  const openPermissions = (role: SystemRole) => {
    isDismissedRef.current = true;
    setOpen(false);
    setPermissionsRole(role);
    setPermissionsOpen(true);
  };

  const SelectedIcon = roleIcons[value];
  const keepDefaultNote = value === "NONE" && isProjectRole;
  const label = `${systemRoleAccessRights[value].name}${
    keepDefaultNote ? " (keep default role)" : ""
  }`;

  return (
    <>
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value}
        onValueChange={(role) => onValueChange(role as Role)}
        disabled={disabled}
      >
        <SelectTrigger
          ref={triggerRef}
          id={triggerId}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={triggerVariants({ size })}
          disableValueLineClamp
        >
          <span className="flex min-w-0 items-center gap-2">
            <SelectedIcon size="base" />
            <span className="truncate" title={label}>
              {label}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent
          onEscapeKeyDown={() => {
            isDismissedRef.current = true;
          }}
          onPointerDownOutside={() => {
            isDismissedRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            const isPick = !isDismissedRef.current;
            isDismissedRef.current = false;
            if (!isPick || !onAfterPick) return;
            event.preventDefault();
            onAfterPick();
          }}
        >
          {roles.map((role) => (
            <RoleSelectItem
              key={role}
              role={role}
              isProjectRole={isProjectRole}
              disabledReason={
                role === "OWNER" && !canManageOwnership
                  ? "requires owner access"
                  : undefined
              }
              onViewPermissions={openPermissions}
            />
          ))}
        </SelectContent>
      </Select>
      <RolePermissionPopup
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        role={permissionsRole}
        emptyStateComment={
          isProjectRole ? projectNoneRoleComment : orgNoneRoleComment
        }
        onCloseAutoFocus={
          onAfterPick
            ? (event) => {
                event.preventDefault();
                triggerRef.current?.focus();
              }
            : undefined
        }
      />
    </>
  );
}
