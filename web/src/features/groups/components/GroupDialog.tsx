import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { GroupMembersSection } from "@/src/features/groups/components/GroupMembersSection";
import { GroupRoleDialog } from "@/src/features/groups/components/GroupRoleDialog";
import { toMemberOption } from "@/src/features/groups/groupMember";
import {
  isScimManaged,
  NO_GROUP_EDIT_REASON,
} from "@/src/features/groups/groupSource";
import { useAddGroupMembers } from "@/src/features/groups/hooks/useAddGroupMembers";
import { useGroupOrgMembers } from "@/src/features/groups/hooks/useGroupOrgMembers";
import { useOrgGroups } from "@/src/features/groups/hooks/useOrgGroups";
import { useRemoveGroupMember } from "@/src/features/groups/hooks/useRemoveGroupMember";
import { useSetGroupOrgRole } from "@/src/features/groups/hooks/useSetGroupOrgRole";
import { type RouterOutputs } from "@/src/utils/api";

type Group = RouterOutputs["groups"]["list"][number];

function projectRolesFootnote(group: Group) {
  const projects = group.projectRoles.length;
  if (projects === 0) return undefined;
  return `It also has roles in ${projects} ${projects === 1 ? "project" : "projects"}.`;
}

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
  const groups = useOrgGroups(orgId);
  const group = groups.data?.find((g) => g.id === groupId);
  const canManageMembers = Boolean(canEdit && group && !isScimManaged(group));
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    organizationId: orgId,
  });
  const orgMembers = useGroupOrgMembers(orgId, canManageMembers);
  const addMembers = useAddGroupMembers(group?.displayName ?? "Group");
  const removeMember = useRemoveGroupMember(group?.displayName ?? "Group");
  const setOrgRole = useSetGroupOrgRole(group?.displayName ?? "Group");

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

  const memberIds = new Set(group.members.map((member) => member.userId));
  return (
    <GroupRoleDialog
      level="organization"
      groupName={group.displayName}
      isScimManaged={isScimManaged(group)}
      memberCount={group.members.length}
      orgRole={group.orgRole}
      isAiGatewayEnabled={isAiGatewayEnabled}
      disabledReason={canEdit ? undefined : NO_GROUP_EDIT_REASON}
      roleFootnote={projectRolesFootnote(group)}
      onChange={(role) => setOrgRole.mutate({ orgId, groupId: group.id, role })}
      onDone={onDone}
    >
      <GroupMembersSection
        members={group.members}
        addMembers={
          canManageMembers
            ? {
                candidates: (orgMembers.data ?? [])
                  .filter((user) => !memberIds.has(user.id))
                  .map(toMemberOption),
                isLoadingCandidates: orgMembers.isLoading,
                isAdding: addMembers.isPending,
                onAdd: (userIds) =>
                  addMembers.mutateAsync({ orgId, groupId: group.id, userIds }),
              }
            : undefined
        }
        onRemove={
          canManageMembers
            ? (member) =>
                removeMember.mutate({
                  orgId,
                  groupId: group.id,
                  userId: member.userId,
                })
            : undefined
        }
        error={addMembers.error?.message ?? removeMember.error?.message}
      />
    </GroupRoleDialog>
  );
}
