import { zodResolver } from "@hookform/resolvers/zod";
import { type Role } from "@langfuse/shared";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";

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

const formSchema = z.object({
  displayName: z.string().trim().min(1).max(256),
  role: z.custom<Role>(),
  userIds: z.array(z.string()),
});

export type NewGroup = z.infer<typeof formSchema>;

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
  const form = useForm<NewGroup>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: "", role: "NONE", userIds: [] },
    mode: "onChange",
  });

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
          disabled: !form.formState.isValid,
        },
      ]}
    >
      <form
        id={formId}
        onSubmit={form.handleSubmit((group) => {
          if (!isPending) onSubmit(group);
        })}
      >
        <Dialog.Body>
          <FormField label="Name">
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. platform-admins"
                maxLength={256}
                autoFocus
                {...form.register("displayName")}
              />
            )}
          </FormField>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <label
                    htmlFor={roleId}
                    className="text-sm leading-none font-bold"
                  >
                    Role in the organization
                  </label>
                  {field.value !== "NONE" && (
                    <RolePermissionsLink role={field.value} />
                  )}
                </div>
                <RoleField
                  id={roleId}
                  roles={roles}
                  value={field.value}
                  onChange={field.onChange}
                  noneDescription={noOrgRoleDescription}
                />
              </div>
            )}
          />
          <FormField control={form.control} name="userIds" label="Members">
            {({ id, value, onChange }) => (
              <MultiSelectInput
                id={id}
                value={value}
                options={people}
                onValueChange={onChange}
                placeholder="Select organization members"
                selectedLabel={`${memberCountLabel(value.length)} selected`}
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
