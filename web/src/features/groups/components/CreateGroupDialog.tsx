import { useId, useState } from "react";
import { type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { noOrgRoleDescription } from "@/src/features/groups/components/GroupRoleDialog";
import { RolePermissionsLink } from "@/src/features/rbac/components/RolePermissionsLink";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { roleDisplay } from "@/src/features/rbac/components/roleDisplay";

export type NewGroup = { displayName: string; role: Role; userIds: string[] };

const groupRoleDisplay = (role: SystemRole) =>
  role === "NONE"
    ? { ...roleDisplay(role), description: noOrgRoleDescription }
    : roleDisplay(role);

/** Names a new group and picks its role and members, so creating it takes one step. */
export function CreateGroupDialog({
  roles,
  people,
  isLoadingPeople = false,
  isPending,
  error,
  onSubmit,
}: {
  /** The organization roles a group can give. */
  roles: Role[];
  /** The organization members that can join the group. */
  people: { value: string; label: string; secondaryLabel?: string }[];
  isLoadingPeople?: boolean;
  isPending: boolean;
  error?: string;
  onSubmit: (group: NewGroup) => void;
}) {
  const formId = useId();
  const nameId = useId();
  const roleId = useId();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("NONE");
  const [userIds, setUserIds] = useState<string[]>([]);
  const trimmed = name.trim();

  return (
    <Dialog
      title="New group"
      closeLabel="Cancel"
      actions={[
        {
          label: "Create group",
          type: "submit",
          form: formId,
          loading: isPending,
          disabled: trimmed.length === 0,
        },
      ]}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSubmit({ displayName: trimmed, role, userIds });
        }}
      >
        <Dialog.Body>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="font-bold">
                Name
              </label>
              <Input
                id={nameId}
                placeholder="e.g. platform-admins"
                value={name}
                maxLength={256}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={roleId} className="font-bold">
                  Role in the organization
                </label>
                {role !== "NONE" && <RolePermissionsLink roles={[role]} />}
              </div>
              <RoleSelect
                triggerId={roleId}
                menu="trigger"
                roles={roles}
                value={role}
                onValueChange={setRole}
                display={groupRoleDisplay}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-bold">Members</p>
              <MultiSelectInput
                aria-label="Members"
                value={userIds}
                options={people}
                onValueChange={setUserIds}
                placeholder="Select organization members"
                selectedLabel={`${memberCountLabel(userIds.length)} selected`}
                searchPlaceholder="Search members"
                emptyMessage="No organization members"
                disabled={isLoadingPeople}
              />
            </div>
            {error && <p className="text-destructive">{error}</p>}
          </div>
        </Dialog.Body>
      </form>
    </Dialog>
  );
}
