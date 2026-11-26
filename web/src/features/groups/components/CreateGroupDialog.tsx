import { useId, useState } from "react";
import { type Role } from "@langfuse/shared";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import {
  memberCountLabel,
  type MemberOption,
} from "@/src/features/groups/groupMember";
import { noOrgRoleDescription } from "@/src/features/groups/groupRoles";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { RolePermissionsLink } from "@/src/features/rbac/components/RolePermissionsLink";

export type NewGroup = { displayName: string; role: Role; userIds: string[] };

export function CreateGroupDialog({
  roles,
  people,
  isLoadingPeople = false,
  isPending,
  error,
  onSubmit,
}: {
  roles: Role[];
  people: MemberOption[];
  isLoadingPeople?: boolean;
  isPending: boolean;
  error?: string;
  onSubmit: (group: NewGroup) => void;
}) {
  const formId = useId();
  const roleId = useId();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("NONE");
  const [userIds, setUserIds] = useState<string[]>([]);
  const trimmed = name.trim();

  return (
    <Dialog
      noCapture
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
          <FormField label="Name">
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. platform-admins"
                value={name}
                maxLength={256}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor={roleId}
                className="text-sm leading-none font-bold"
              >
                Role in the organization
              </label>
              {role !== "NONE" && <RolePermissionsLink role={role} />}
            </div>
            <RoleField
              id={roleId}
              roles={roles}
              value={role}
              onChange={setRole}
              noneDescription={noOrgRoleDescription}
            />
          </div>
          <FormField label="Members">
            {({ id }) => (
              <MultiSelectInput
                id={id}
                value={userIds}
                options={people}
                onValueChange={setUserIds}
                placeholder="Select organization members"
                selectedLabel={`${memberCountLabel(userIds.length)} selected`}
                searchPlaceholder="Search members"
                emptyMessage="No organization members"
                disabled={isLoadingPeople}
              />
            )}
          </FormField>
          {error && <p className="text-destructive">{error}</p>}
        </Dialog.Body>
      </form>
    </Dialog>
  );
}
