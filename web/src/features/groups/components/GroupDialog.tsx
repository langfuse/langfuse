import { useState } from "react";
import { PlusIcon } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { GroupRoleDialog } from "@/src/features/groups/components/GroupRoleDialog";
import {
  isScimManaged,
  NO_GROUP_EDIT_REASON,
} from "@/src/features/groups/groupSource";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { api, type RouterOutputs } from "@/src/utils/api";

type Group = RouterOutputs["groups"]["list"][number];

const orgRoleBlockedReason = (canEdit: boolean, isSaving: boolean) => {
  if (!canEdit) return NO_GROUP_EDIT_REASON;
  if (isSaving) return "Saving…";
  return undefined;
};

function projectRolesFootnote(group: Group) {
  const projects = group.projectRoles.length;
  if (projects === 0) return undefined;
  return `It also has roles in ${projects} ${projects === 1 ? "project" : "projects"}.`;
}

/** A group's organization role and its members, in one dialog. */
export function GroupDialog({
  orgId,
  groupId,
  canEdit,
  onDone,
}: {
  orgId: string;
  groupId: string;
  canEdit: boolean;
  onDone: () => void;
}) {
  // Read from the list query so the dialog reflects adds, removals and role changes.
  const groups = api.groups.list.useQuery({ orgId });
  const group = groups.data?.find((g) => g.id === groupId);
  const utils = api.useUtils();
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    organizationId: orgId,
  });
  const removeMember = api.groups.removeMember.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const setOrgRole = api.groups.setOrgRole.useMutation({
    onSuccess: ({ role }) => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      const name = group?.displayName ?? "Group";
      showSuccessToast({
        operation: "group_roles.update",
        title: "Group role saved",
        description: role
          ? `${name} is now ${roleName(role)} in this organization`
          : `${name} no longer has an organization role`,
        duration: 2000,
      });
    },
  });

  if (!group) {
    if (groups.error)
      return (
        <Dialog title="Group" text={groups.error.message} closeLabel="Close" />
      );
    return groups.data ? (
      <Dialog
        title="Group not found"
        text="This group no longer exists, or the link to it is wrong."
        closeLabel="Close"
      />
    ) : (
      <Dialog title="Group" text="Loading…" closeLabel="Close" />
    );
  }

  const canManageMembers = canEdit && !isScimManaged(group);
  return (
    <GroupRoleDialog
      level="organization"
      groupName={group.displayName}
      isScimManaged={isScimManaged(group)}
      memberCount={group.members.length}
      members={group.members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        image: member.image,
      }))}
      membersToolbar={
        canManageMembers ? (
          <AddGroupMembers orgId={orgId} group={group} />
        ) : undefined
      }
      onRemoveMember={
        canManageMembers
          ? (member) =>
              removeMember.mutate({ orgId, groupId, userId: member.userId })
          : undefined
      }
      membersError={removeMember.error?.message}
      roleFootnote={projectRolesFootnote(group)}
      orgRole={group.orgRole}
      isAiGatewayEnabled={isAiGatewayEnabled}
      disabledReason={orgRoleBlockedReason(canEdit, setOrgRole.isPending)}
      onChange={(role) => setOrgRole.mutate({ orgId, groupId: group.id, role })}
      onDone={onDone}
    />
  );
}

/** Picks organization members and adds them to the group. */
function AddGroupMembers({ orgId, group }: { orgId: string; group: Group }) {
  const utils = api.useUtils();
  const [selected, setSelected] = useState<string[]>([]);
  const orgMembers = api.groups.orgMembers.useQuery({ orgId });
  const addMembers = api.groups.addMembers.useMutation({
    onSuccess: () => {
      setSelected([]);
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      showSuccessToast({
        operation: "group_members.update",
        title: "Members added",
        description: `Updated members of ${group.displayName}`,
        duration: 2000,
      });
    },
  });

  const memberIds = new Set(group.members.map((m) => m.userId));
  const options = (orgMembers.data ?? [])
    .filter((user) => !memberIds.has(user.id))
    .map((user) => ({
      value: user.id,
      label: user.name ?? user.email ?? user.id,
      secondaryLabel: user.name ? (user.email ?? undefined) : undefined,
    }));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MultiSelectInput
            aria-label="Add members"
            value={selected}
            options={options}
            onValueChange={setSelected}
            placeholder="Select organization members"
            selectedLabel={`${memberCountLabel(selected.length)} selected`}
            searchPlaceholder="Search members"
            emptyMessage="No more organization members to add"
            disabled={orgMembers.isLoading}
          />
        </div>
        <Button
          text="Add"
          icon={PlusIcon}
          disabled={selected.length === 0}
          loading={addMembers.isPending}
          onClick={() =>
            addMembers.mutate({ orgId, groupId: group.id, userIds: selected })
          }
        />
      </div>
      {addMembers.error && (
        <p className="text-destructive">{addMembers.error.message}</p>
      )}
    </div>
  );
}
